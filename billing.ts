import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, operatorOrAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ==================== BILLING TRANSACTIONS ====================

// Get transaction history for a client
router.get('/transactions', async (req, res) => {
  try {
    const { clientId, type, page = '1', limit = '50' } = req.query;
    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (type) where.type = type;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [txns, total] = await Promise.all([
      prisma.billingTransaction.findMany({
        where, orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string), skip,
        include: { client: { select: { name: true, currency: true } } }
      }),
      prisma.billingTransaction.count({ where })
    ]);
    res.json({ transactions: txns, total });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Add credit/debit to client
router.post('/transactions', operatorOrAdmin, async (req, res) => {
  try {
    const { clientId, type, amount, description, reference } = req.body;
    if (!clientId || !type || !amount) {
      return res.status(400).json({ error: 'clientId, type, amount required' });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const delta = type === 'CREDIT' || type === 'REFUND' ? Math.abs(amount) : -Math.abs(amount);
    const newBalance = Number(client.balance) + delta;

    const [txn] = await prisma.$transaction([
      prisma.billingTransaction.create({
        data: {
          clientId, type, amount: Math.abs(amount),
          balance: newBalance,
          description, reference
        }
      }),
      prisma.client.update({
        where: { id: clientId },
        data: { balance: newBalance }
      })
    ]);

    res.status(201).json(txn);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get billing summary for all clients
router.get('/summary', operatorOrAdmin, async (_req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [clients, todayRevenue, monthRevenue, pendingInvoices] = await Promise.all([
      prisma.client.findMany({
        select: { id: true, name: true, balance: true, creditLimit: true, currency: true, status: true },
        orderBy: { balance: 'asc' }
      }),
      prisma.messageLog.aggregate({
        where: { createdAt: { gte: today }, clientCharged: true },
        _sum: { pay: true, cost: true }
      }),
      prisma.messageLog.aggregate({
        where: { createdAt: { gte: monthStart }, clientCharged: true },
        _sum: { pay: true, cost: true }
      }),
      prisma.invoice.aggregate({
        where: { status: 'PENDING' },
        _sum: { total: true },
        _count: true
      })
    ]);

    res.json({
      clients,
      todayRevenue: Number(todayRevenue._sum.pay || 0),
      todayCost: Number(todayRevenue._sum.cost || 0),
      todayProfit: Number(todayRevenue._sum.pay || 0) - Number(todayRevenue._sum.cost || 0),
      monthRevenue: Number(monthRevenue._sum.pay || 0),
      monthCost: Number(monthRevenue._sum.cost || 0),
      monthProfit: Number(monthRevenue._sum.pay || 0) - Number(monthRevenue._sum.cost || 0),
      pendingInvoicesTotal: Number(pendingInvoices._sum.total || 0),
      pendingInvoicesCount: pendingInvoices._count
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== INVOICES ====================

router.get('/invoices', async (req, res) => {
  try {
    const { clientId, status, page = '1', limit = '50' } = req.query;
    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (status) where.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where, orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string), skip,
        include: { client: { select: { name: true, email: true, company: true } } }
      }),
      prisma.invoice.count({ where })
    ]);
    res.json({ invoices, total });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { client: true }
    });
    if (!invoice) return res.status(404).json({ error: 'Not found' });

    // Get company settings for invoice rendering
    const company = await prisma.companySettings.findFirst();
    res.json({ invoice, company });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generate invoice from real message logs
router.post('/invoices/generate', operatorOrAdmin, async (req, res) => {
  try {
    const { clientId, startDate, endDate, dueDate, taxRate, notes } = req.body;
    if (!clientId || !startDate || !endDate || !dueDate) {
      return res.status(400).json({ error: 'clientId, startDate, endDate, dueDate required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const company = await prisma.companySettings.findFirst();
    const effectiveTaxRate = taxRate ?? Number(company?.taxRate ?? 5);

    // Aggregate from real message logs
    const logs = await prisma.messageLog.aggregate({
      where: { clientId, clientCharged: true, createdAt: { gte: start, lte: end } },
      _sum: { pay: true, cost: true },
      _count: true
    });

    const amount = Number(logs._sum.pay || 0);
    const tax = amount * (effectiveTaxRate / 100);
    const total = amount + tax;

    // Generate invoice number
    const year = new Date().getFullYear();
    const count = await prisma.invoice.count();
    const prefix = company?.invoicePrefix || 'INV';
    const number = `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;

    const period = `${start.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;

    const invoice = await prisma.invoice.create({
      data: {
        number, clientId, period,
        totalMessages: logs._count,
        amount, tax, total,
        currency: client.currency || 'USD',
        dueDate: new Date(dueDate),
        notes: notes || null
      },
      include: { client: { select: { name: true, email: true } } }
    });

    res.status(201).json(invoice);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/invoices/:id/status', operatorOrAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        status,
        paidDate: status === 'PAID' ? new Date() : null
      }
    });

    // If paid, record a billing transaction credit
    if (status === 'PAID') {
      await prisma.billingTransaction.create({
        data: {
          clientId: invoice.clientId,
          type: 'INVOICE',
          amount: Number(invoice.total),
          balance: 0, // will be updated separately
          description: `Invoice ${invoice.number} paid`,
          reference: invoice.number
        }
      });
    }

    res.json(invoice);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/invoices/:id', operatorOrAdmin, async (req, res) => {
  try {
    await prisma.invoice.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== REPORTS ====================

router.get('/reports/daily', async (req, res) => {
  try {
    const { clientId, supplierId, days = '30' } = req.query;
    const numDays = parseInt(days as string);
    const since = new Date(); since.setDate(since.getDate() - numDays); since.setHours(0, 0, 0, 0);

    const where: any = { createdAt: { gte: since } };
    if (clientId) where.clientId = clientId;
    if (supplierId) where.supplierId = supplierId;

    const logs = await prisma.messageLog.findMany({
      where,
      select: { createdAt: true, status: true, pay: true, cost: true, clientCharged: true }
    });

    // Group by day
    const daily: Record<string, any> = {};
    for (const log of logs) {
      const date = log.createdAt.toISOString().split('T')[0];
      if (!daily[date]) daily[date] = { date, sent: 0, delivered: 0, failed: 0, revenue: 0, cost: 0, profit: 0 };
      daily[date].sent++;
      if (log.status === 'DELIVERED') daily[date].delivered++;
      if (log.status === 'FAILED') daily[date].failed++;
      if (log.clientCharged) {
        daily[date].revenue += Number(log.pay);
        daily[date].cost += Number(log.cost);
        daily[date].profit += Number(log.pay) - Number(log.cost);
      }
    }

    const result = Object.values(daily).sort((a: any, b: any) => a.date.localeCompare(b.date));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/by-country', async (req, res) => {
  try {
    const { clientId, startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    const where: any = { createdAt: { gte: start, lte: end } };
    if (clientId) where.clientId = clientId;

    const logs = await prisma.messageLog.findMany({
      where,
      select: { recipient: true, status: true, pay: true, cost: true }
    });

    // Group by country code (first digits of recipient)
    const byCountry: Record<string, any> = {};
    for (const log of logs) {
      const cc = log.recipient?.substring(0, 2) || 'XX';
      if (!byCountry[cc]) byCountry[cc] = { country: cc, sent: 0, delivered: 0, revenue: 0, cost: 0 };
      byCountry[cc].sent++;
      if (log.status === 'DELIVERED') byCountry[cc].delivered++;
      byCountry[cc].revenue += Number(log.pay);
      byCountry[cc].cost += Number(log.cost);
    }

    const result = Object.values(byCountry).sort((a: any, b: any) => b.sent - a.sent);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/by-client', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    const clients = await prisma.client.findMany({ select: { id: true, name: true } });
    const result = [];

    for (const client of clients) {
      const agg = await prisma.messageLog.aggregate({
        where: { clientId: client.id, createdAt: { gte: start, lte: end } },
        _sum: { pay: true, cost: true },
        _count: true
      });
      const delivered = await prisma.messageLog.count({
        where: { clientId: client.id, status: 'DELIVERED', createdAt: { gte: start, lte: end } }
      });
      if (agg._count > 0) {
        result.push({
          clientId: client.id,
          clientName: client.name,
          totalMessages: agg._count,
          delivered,
          dlrRate: agg._count > 0 ? (delivered / agg._count * 100).toFixed(1) : '0',
          revenue: Number(agg._sum.pay || 0),
          cost: Number(agg._sum.cost || 0),
          profit: Number(agg._sum.pay || 0) - Number(agg._sum.cost || 0)
        });
      }
    }

    result.sort((a, b) => b.revenue - a.revenue);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
