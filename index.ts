import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import os from 'os';

dotenv.config();

// ==================== ROUTES ====================
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import supplierRoutes from './routes/suppliers';
import rateRoutes from './routes/rates';
import routeRoutes from './routes/routes';
import kannelRoutes from './routes/kannel';
import billingRoutes from './routes/billing';
import translationRoutes from './routes/translations';
import logRoutes from './routes/logs';
import campaignRoutes from './routes/campaigns';
import invoiceRoutes from './routes/invoices';
import userRoutes from './routes/users';
import smtpRoutes from './routes/smtp';
import companyRoutes from './routes/company';
import dashboardRoutes from './routes/dashboard';
import systemRoutes from './routes/system';
import { startSmppServer } from './smpp/server';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  pingTimeout: 60000,
  pingInterval: 25000
});

export const prisma = new PrismaClient({ log: ['error', 'warn'] });

console.log('[BOOT] Starting SMPP Gateway Manager v2...');

// ==================== MIDDLEWARE ====================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('short'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', rateLimit({ windowMs: 60000, max: 5000, standardHeaders: true }));

// ==================== HEALTH ====================
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected', version: '2.0.0' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: e.message });
  }
});

// ==================== API ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/kannel', kannelRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/translations', translationRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/smtp', smtpRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes);

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on('subscribe:logs', () => {
    socket.join('logs');
    socket.emit('subscribed', { room: 'logs' });
  });

  socket.on('subscribe:dashboard', () => {
    socket.join('dashboard');
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

export { io };

// ==================== ERROR HANDLER ====================
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err?.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ==================== BOOT ====================
function getServerIP(): string {
  const ifaces = os.networkInterfaces();
  for (const n of Object.keys(ifaces)) {
    for (const i of ifaces[n] || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

const PORT = parseInt(process.env.PORT || '3001');

async function boot() {
  try {
    await prisma.$connect();
    console.log('[BOOT] ✅ Database connected');
  } catch (e: any) {
    console.error('[BOOT] ❌ DB error:', e.message);
    console.error('[BOOT] Check DATABASE_URL in .env');
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    const ip = getServerIP();
    console.log(`[BOOT] ✅ HTTP API: http://${ip}:${PORT}`);
    console.log(`[BOOT] ✅ WebSocket: ws://${ip}:${PORT}`);

    try {
      startSmppServer();
      console.log(`[BOOT] ✅ SMPP Server: ${ip}:${process.env.SMPP_PORT || 2775}`);
    } catch (e: any) {
      console.error('[BOOT] ❌ SMPP error:', e.message);
    }
  });
}

boot().catch(e => console.error('[FATAL]', e));
process.on('uncaughtException', e => console.error('[UNCAUGHT]', e));
process.on('unhandledRejection', r => console.error('[UNHANDLED]', r));
process.on('SIGTERM', async () => {
  console.log('[SHUTDOWN] Graceful shutdown...');
  await prisma.$disconnect();
  process.exit(0);
});
