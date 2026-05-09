import { Router } from 'express';
import { prisma } from '../index';
import { authenticate, adminOnly } from '../middleware/auth';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const router = Router();
router.use(authenticate);
router.use(adminOnly);

// ==================== CRUD ====================

router.get('/', async (_req, res) => {
  try {
    const configs = await prisma.kannelConfig.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(configs);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { generateConf, ...data } = req.body;
    const kannelConf = generateKannelConf(data);
    const config = await prisma.kannelConfig.create({ data: { ...data, kannelConf } });
    res.status(201).json(config);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { generateConf, ...data } = req.body;
    const kannelConf = generateKannelConf(data);
    const config = await prisma.kannelConfig.update({
      where: { id: req.params.id },
      data: { ...data, kannelConf }
    });
    res.json(config);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.kannelConfig.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== CONFIG GENERATION ====================

router.get('/:id/conf', async (req, res) => {
  try {
    const config = await prisma.kannelConfig.findUnique({ where: { id: req.params.id } });
    if (!config) return res.status(404).json({ error: 'Not found' });
    const conf = generateKannelConf(config as any);
    res.json({ conf, config });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generate full kannel.conf for all active configs
router.get('/generate/full', async (_req, res) => {
  try {
    const configs = await prisma.kannelConfig.findMany({ where: { status: 'ACTIVE' } });
    const clients = await prisma.client.findMany({ where: { status: 'ACTIVE', type: 'SMPP' } });
    const suppliers = await prisma.supplier.findMany({ where: { status: 'ACTIVE', type: 'SMPP' } });

    const fullConf = generateFullKannelConf(configs as any[], clients as any[], suppliers as any[]);
    res.json({ conf: fullConf });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Apply config to file system
router.post('/apply', async (req, res) => {
  try {
    const { conf, filename = 'kannel.conf' } = req.body;
    const confPath = `/etc/kannel/${filename}`;
    
    // Write to temp file first for safety
    const tmpPath = `/tmp/${filename}.tmp`;
    fs.writeFileSync(tmpPath, conf, 'utf8');
    
    // Check if kannel is installed
    try {
      await execAsync('which bearerbox');
      fs.mkdirSync('/etc/kannel', { recursive: true });
      fs.copyFileSync(tmpPath, confPath);
      
      // Test config
      const { stdout, stderr } = await execAsync(`bearerbox -v 1 ${confPath} 2>&1 || true`);
      res.json({ success: true, path: confPath, output: stdout + stderr });
    } catch {
      // Kannel not installed, just save to /opt
      const altPath = `/opt/smpp-gateway/kannel/${filename}`;
      fs.mkdirSync(path.dirname(altPath), { recursive: true });
      fs.copyFileSync(tmpPath, altPath);
      res.json({ success: true, path: altPath, message: 'Config saved (kannel not installed)' });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Restart kannel services
router.post('/restart', async (req, res) => {
  try {
    const { service } = req.body; // bearerbox | smsbox | smppbox | sqlbox | all
    const services = service === 'all' ? ['bearerbox', 'smsbox', 'smppbox', 'sqlbox'] : [service];
    const results: any[] = [];

    for (const svc of services) {
      try {
        const { stdout, stderr } = await execAsync(`systemctl restart ${svc} 2>&1 || service ${svc} restart 2>&1 || echo "${svc} not running as service"`);
        results.push({ service: svc, success: true, output: stdout + stderr });
      } catch (e: any) {
        results.push({ service: svc, success: false, error: e.message });
      }
    }
    res.json({ results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Service status
router.get('/status/services', async (_req, res) => {
  try {
    const services = ['bearerbox', 'smsbox', 'smppbox', 'sqlbox'];
    const status: any = {};

    for (const svc of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${svc} 2>/dev/null || echo "inactive"`);
        status[svc] = stdout.trim();
      } catch {
        status[svc] = 'inactive';
      }
    }
    res.json(status);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ==================== CONFIG GENERATORS ====================

function generateKannelConf(config: any): string {
  const component = config.component || 'SMPPBOX';

  switch (component) {
    case 'BEARERBOX': return generateBearerboxConf(config);
    case 'SMSBOX': return generateSmsboxConf(config);
    case 'SMPPBOX': return generateSmppboxConf(config);
    case 'SQLBOX': return generateSqlboxConf(config);
    default: return generateSmppboxConf(config);
  }
}

function generateBearerboxConf(config: any): string {
  return `# ============================================================
# BEARERBOX Configuration - Generated by SMPP Gateway Manager
# Component: BearerBox (Main Routing Engine)
# Generated: ${new Date().toISOString()}
# ============================================================

group = core
admin-port = 13000
admin-passwd = ${config.password || 'admin_password'}
status-password = ${config.password || 'status_password'}
log-file = /var/log/kannel/bearerbox.log
log-level = 0
box-allow-ip = 127.0.0.1
access-log = /var/log/kannel/access.log

# SMPP Box connection
group = smppbox
smppbox-port = ${config.port || 2775}

# SMS Box connection
group = smsbox
smsbox-port = 13001
sendsms-port = 13013

# SMSC connection for supplier (${config.name})
group = smsc
smsc = smpp
smsc-id = ${config.name?.toLowerCase().replace(/\s+/g, '_') || 'supplier_smpp'}
host = ${config.host || '127.0.0.1'}
port = ${config.port || 2775}
transceiver-mode = 1
smsc-username = ${config.username || 'smppuser'}
smsc-password = ${config.password || 'smpppass'}
system-type = ${config.systemType || 'VMA'}
log-file = /var/log/kannel/smsc_${config.name?.toLowerCase().replace(/\s+/g, '_') || 'smsc'}.log
log-level = 0
throughput = ${config.tps || 100}
`;
}

function generateSmsboxConf(config: any): string {
  return `# ============================================================
# SMSBOX Configuration - Generated by SMPP Gateway Manager
# Component: SMSBox (Application Gateway)
# Generated: ${new Date().toISOString()}
# ============================================================

group = smsbox
bearerbox-host = ${config.bearerboxHost || '127.0.0.1'}
bearerbox-port = 13001
sendsms-port = 13013
sendsms-interface = ${config.host || '0.0.0.0'}
log-file = /var/log/kannel/smsbox.log
log-level = 0
reply-couldnotfetch = No
reply-couldnotrepresent = No
mo-recode = true

group = sendsms-user
username = ${config.username || 'smsuser'}
password = ${config.password || 'smspass'}
concatenation = true
max-messages = 10
`;
}

function generateSmppboxConf(config: any): string {
  return `# ============================================================
# SMPPBOX Configuration - Generated by SMPP Gateway Manager
# Component: SMPPBox (SMPP Server - accepts client connections)
# Generated: ${new Date().toISOString()}
# Mode: ${config.mode || 'SERVER'}
# ============================================================

group = smppbox
bearerbox-host = ${config.bearerboxHost || '127.0.0.1'}
bearerbox-port = 13001
smppbox-port = ${config.port || 2775}
smppbox-id = ${config.name?.toLowerCase().replace(/\s+/g, '_') || 'smppbox1'}
log-file = /var/log/kannel/smppbox.log
log-level = 0
smpp-logins = /etc/kannel/smpp-logins.conf
throughput = ${config.tps || 100}

# Client Authentication (${config.mode === 'SERVER' ? 'Accept External Clients' : 'Connect to External Supplier'})
${config.mode === 'SERVER' ? `# Server Mode: External clients connect to port ${config.port || 2775}
# Add client credentials to /etc/kannel/smpp-logins.conf` : `# Client Mode: Connect to external supplier
group = smppbox-route
smppbox-id = ${config.name?.toLowerCase().replace(/\s+/g, '_') || 'smppbox1'}
route-to-smsc = ${config.name?.toLowerCase().replace(/\s+/g, '_') || 'supplier'}`}
`;
}

function generateSqlboxConf(config: any): string {
  const dbHost = config.sqlboxDbHost || 'localhost';
  const dbPort = config.sqlboxDbPort || 3306;
  const dbName = config.sqlboxDbName || 'smpp_gateway';
  const dbUser = config.sqlboxDbUser || 'smpp_user';
  const dbPass = config.sqlboxDbPass || 'password';

  return `# ============================================================
# SQLBOX Configuration - Generated by SMPP Gateway Manager
# Component: SQLBox (Database Integration)
# Generated: ${new Date().toISOString()}
# ============================================================

group = sqlbox
bearerbox-host = ${config.bearerboxHost || '127.0.0.1'}
bearerbox-port = 13001
sqlbox-id = ${config.name?.toLowerCase().replace(/\s+/g, '_') || 'sqlbox1'}
log-file = /var/log/kannel/sqlbox.log
log-level = 0

# MySQL/MariaDB Connection
sql-driver = mysql
sql-host = ${dbHost}
sql-port = ${dbPort}
sql-database = ${dbName}
sql-username = ${dbUser}
sql-password = ${dbPass}

# SQL Tables
mo-table = mo_messages
mt-table = mt_messages

# MT (Mobile Terminated) SQL Table Schema:
# CREATE TABLE mt_messages (
#   id BIGINT PRIMARY KEY AUTO_INCREMENT,
#   momt ENUM('MO','MT') NOT NULL DEFAULT 'MT',
#   sender VARCHAR(20),
#   receiver VARCHAR(20),
#   udhdata TEXT,
#   msgdata TEXT,
#   time BIGINT,
#   smsc_id VARCHAR(64),
#   service VARCHAR(64),
#   account VARCHAR(64),
#   id2 BIGINT,
#   sms_type BIGINT,
#   mclass BIGINT,
#   mwi BIGINT,
#   coding BIGINT,
#   compress BIGINT,
#   validity BIGINT,
#   deferred BIGINT,
#   dlr_mask BIGINT,
#   dlr_url VARCHAR(255),
#   pid BIGINT,
#   alt_dcs BIGINT,
#   rpi BIGINT,
#   charset VARCHAR(64),
#   boxc_id VARCHAR(64),
#   binfo VARCHAR(64),
#   meta_data TEXT,
#   status VARCHAR(20) DEFAULT 'pending'
# );
`;
}

function generateFullKannelConf(configs: any[], clients: any[], suppliers: any[]): string {
  const serverIP = process.env.SERVER_IP || '0.0.0.0';

  let conf = `# ============================================================
# FULL KANNEL CONFIGURATION
# Generated by SMPP Gateway Manager
# Generated: ${new Date().toISOString()}
# Server: ${serverIP}
# ============================================================

# ============================================================
# CORE / BEARERBOX
# ============================================================
group = core
admin-port = 13000
admin-passwd = ${process.env.KANNEL_ADMIN_PASS || 'admin_secure_pass'}
status-password = ${process.env.KANNEL_STATUS_PASS || 'status_secure_pass'}
log-file = /var/log/kannel/bearerbox.log
log-level = 1
box-allow-ip = 127.0.0.1
access-log = /var/log/kannel/access.log

# ============================================================
# SMPPBOX (Client-facing SMPP server on port 2775)
# ============================================================
group = smppbox
bearerbox-host = 127.0.0.1
bearerbox-port = 13001
smppbox-port = 2775
smppbox-id = main_smppbox
log-file = /var/log/kannel/smppbox.log
log-level = 1
smpp-logins = /etc/kannel/smpp-logins.conf

# ============================================================
# SQLBOX (Database logging)
# ============================================================
group = sqlbox
bearerbox-host = 127.0.0.1
bearerbox-port = 13001
sqlbox-id = main_sqlbox
log-file = /var/log/kannel/sqlbox.log
log-level = 1
sql-driver = mysql
sql-host = ${process.env.DB_HOST || 'localhost'}
sql-port = 3306
sql-database = ${process.env.DB_NAME || 'smpp_gateway'}
sql-username = ${process.env.DB_USER || 'smpp_user'}
sql-password = ${process.env.DB_PASS || 'password'}
mo-table = mo_messages
mt-table = mt_messages

# ============================================================
# SMSBOX
# ============================================================
group = smsbox
bearerbox-host = 127.0.0.1
bearerbox-port = 13001
sendsms-port = 13013
log-file = /var/log/kannel/smsbox.log
log-level = 1

`;

  // Add SMSC groups for each active supplier
  for (const supplier of suppliers) {
    if (supplier.type === 'SMPP' && supplier.host) {
      conf += `# ============================================================
# SMSC: ${supplier.name}
# ============================================================
group = smsc
smsc = smpp
smsc-id = ${supplier.name.toLowerCase().replace(/\s+/g, '_')}
host = ${supplier.host}
port = ${supplier.port || 2775}
transceiver-mode = 1
smsc-username = ${supplier.smppUser || ''}
smsc-password = ${supplier.smppPass || ''}
system-type = ${supplier.systemType || 'VMA'}
log-file = /var/log/kannel/smsc_${supplier.name.toLowerCase().replace(/\s+/g, '_')}.log
log-level = 1
throughput = ${supplier.tps || 100}
connect-allow-ip = ${supplier.host}

`;
    }
  }

  // Add smpp-logins for clients
  conf += `\n# ============================================================
# SMPP Client Logins (save as /etc/kannel/smpp-logins.conf)
# ============================================================
`;
  for (const client of clients) {
    conf += `# group = smpp-logins
# smpp-logins-username = ${client.username}
# smpp-logins-password = ${client.password}
# smpp-logins-throughput = ${client.tps || 100}

`;
  }

  // Add any custom kannel configs
  for (const kc of configs) {
    if (kc.status === 'ACTIVE' && kc.component !== 'BEARERBOX') {
      conf += `\n# Custom config: ${kc.name}\n`;
      conf += kc.kannelConf || '';
    }
  }

  return conf;
}

export default router;
