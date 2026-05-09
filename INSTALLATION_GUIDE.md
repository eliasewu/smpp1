# SMPP Gateway Manager v2 - Complete Installation & Operations Guide

**Latest Version:** 2.0.0  
**Last Updated:** May 2026  
**Supported OS:** Debian 11 (Bullseye), Debian 12 (Bookworm), Debian 13 (Trixie)  
**Author:** Tri Angle Trade Centre FZE LLC

---

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Install](#quick-install)
3. [Manual Installation](#manual-installation)
4. [Kannel Integration](#kannel-integration)
5. [Database Setup](#database-setup)
6. [Service Management](#service-management)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)
9. [Backup & Recovery](#backup--recovery)
10. [Security](#security)

---

## System Requirements

### Minimum Hardware
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU       | 2 cores | 4+ cores    |
| RAM       | 2 GB    | 4+ GB       |
| Storage   | 20 GB   | 50+ GB SSD  |
| Network   | 10 Mbps | 100+ Mbps   |

### Software Requirements
- **OS:** Debian 11, 12, or 13 (fresh or existing server)
- **Node.js:** 20.x LTS
- **Database:** MariaDB 10.5+ or MySQL 8.0+
- **Web Server:** Nginx 1.18+
- **Kannel:** Optional but recommended for high-volume SMPP

### Default Credentials
| Item | Value |
|------|-------|
| Admin Email | `admin@triangletrade.net` |
| Admin Password | `Telco1984@s` |
| Database Root Pass | `Telco1988` |
| DB App User | `smpp_user` |
| DB App Pass | `SmppGateway2026SecurePass` |

**⚠️ Change all credentials immediately after installation!**

---

## Quick Install

### One-Line Installation

```bash
# Option 1: From GitHub
curl -fsSL https://raw.githubusercontent.com/smpp1/main/scripts/install.sh | sudo bash

# Option 2: Local file
sudo bash scripts/install.sh
```

### What the script does:
✅ Detects OS and validates requirements  
✅ Installs all system packages and dependencies  
✅ Installs Node.js 20.x LTS and PM2  
✅ Installs and configures MariaDB  
✅ Builds and installs Kannel (BearerBox, SMPPBox, SQLBox, SMSBox)  
✅ Deploys the Node.js application  
✅ Configures Nginx reverse proxy  
✅ Sets up UFW firewall  
✅ Creates systemd services  
✅ Starts all services  

**Installation Time:** 10-20 minutes (depending on server speed and network)

### After Installation

1. **Access Web Panel:**
   ```
   http://YOUR_SERVER_IP
   ```

2. **Default Credentials:**
   - Email: `admin@triangletrade.net`
   - Password: `Telco1984@s`

3. **Change Credentials:**
   - Login → Settings → Change Password

4. **Configure Database:**
   - Settings → Database Config → Verify Connection

---

## Manual Installation

If you prefer to install step-by-step or the auto-script fails:

### 1. System Update

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install System Packages

```bash
sudo apt install -y \
  curl wget git gnupg2 ca-certificates \
  build-essential ufw \
  nginx mariadb-server mariadb-client \
  openssl libssl-dev libgdbm-dev \
  flex bison libpcre3-dev autoconf automake libtool pkg-config libxml2-dev
```

### 3. Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Verify
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 4. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Enable startup
pm2 startup systemd -u root --hp /root
pm2 save
```

### 5. Install & Configure MariaDB

```bash
sudo systemctl start mariadb
sudo systemctl enable mariadb

# Secure installation (optional)
sudo mysql_secure_installation

# Create database and user
sudo mysql <<EOF
CREATE DATABASE IF NOT EXISTS smpp_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'smpp_user'@'localhost' IDENTIFIED BY 'SmppGateway2026SecurePass';
GRANT ALL PRIVILEGES ON smpp_gateway.* TO 'smpp_user'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### 6. Install Kannel (Optional but Recommended)

#### Option A: From APT (Easiest)

```bash
sudo apt install -y kannel kannel-sqlbox

# Verify
bearerbox --version
smppbox --version
sqlbox --version
```

#### Option B: Build from Source

```bash
cd /tmp
wget http://www.kannel.org/download/1.4.5/gateway-1.4.5.tar.gz
tar -xzf gateway-1.4.5.tar.gz
cd gateway-1.4.5

./configure --prefix=/usr --sysconfdir=/etc --with-mysql \
  --enable-ssl --disable-docs
make -j$(nproc)
sudo make install
```

### 7. Deploy Application

```bash
# Clone repository
cd /opt
sudo git clone https://github.com/eliasewu/SMPP-Gateway.git smpp-gateway
cd smpp-gateway

# Create .env file
sudo cat > backend/.env <<'ENV'
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
DATABASE_URL="mysql://smpp_user:SmppGateway2026SecurePass@localhost:3306/smpp_gateway"
JWT_SECRET=$(openssl rand -base64 64)
SMPP_HOST=0.0.0.0
SMPP_PORT=2775
SERVER_IP=$(hostname -I | awk '{print $1}')
ADMIN_EMAIL=admin@triangletrade.net
ADMIN_PASSWORD=Telco1984@s
ENV

# Install dependencies
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npx ts-node prisma/seed.ts

# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name smpp-gateway --max-memory-restart 512M
pm2 save

# Build frontend
cd ..
npm install
npm run build
```

### 8. Configure Nginx

```bash
sudo cat > /etc/nginx/sites-available/smpp-gateway <<'NGINX'
server {
    listen 80;
    server_name _;
    root /opt/smpp-gateway/dist;
    index index.html;

    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # WebSocket (Socket.IO)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    client_max_body_size 50M;
}
NGINX

sudo ln -sf /etc/nginx/sites-available/smpp-gateway /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 9. Configure Firewall (UFW)

```bash
sudo ufw reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment "SSH"
sudo ufw allow 80/tcp comment "HTTP"
sudo ufw allow 443/tcp comment "HTTPS"
sudo ufw allow 2775/tcp comment "SMPP External Clients"
sudo ufw allow 3001/tcp comment "API Backend"
echo "y" | sudo ufw enable
```

### 10. Configure Kannel

```bash
# Create kannel config
sudo mkdir -p /etc/kannel /var/log/kannel /var/lib/kannel
sudo chown -R root:root /etc/kannel
sudo chmod 750 /var/log/kannel

# Copy sample config
sudo cat > /etc/kannel/kannel.conf <<'KANNEL'
# ============================================================
# KANNEL CONFIGURATION
# ============================================================

group = core
admin-port = 13000
admin-passwd = your_admin_password
status-password = your_status_password
log-file = /var/log/kannel/bearerbox.log
log-level = 1
box-allow-ip = 127.0.0.1

group = smsbox
bearerbox-host = 127.0.0.1
bearerbox-port = 13001
sendsms-port = 13013
log-file = /var/log/kannel/smsbox.log
log-level = 1

group = smppbox
bearerbox-host = 127.0.0.1
bearerbox-port = 13001
smppbox-port = 2775
smppbox-id = main_smppbox
log-file = /var/log/kannel/smppbox.log
log-level = 1
smpp-logins = /etc/kannel/smpp-logins.conf

group = sqlbox
bearerbox-host = 127.0.0.1
bearerbox-port = 13001
sqlbox-id = main_sqlbox
log-file = /var/log/kannel/sqlbox.log
log-level = 1
sql-driver = mysql
sql-host = localhost
sql-port = 3306
sql-database = smpp_gateway
sql-username = smpp_user
sql-password = SmppGateway2026SecurePass
mo-table = mo_messages
mt-table = mt_messages
KANNEL

# Create systemd services
sudo cat > /etc/systemd/system/bearerbox.service <<'SVC'
[Unit]
Description=Kannel BearerBox
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=root
ExecStart=/usr/sbin/bearerbox -v 1 /etc/kannel/kannel.conf
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable bearerbox
sudo systemctl start bearerbox
```

---

## Kannel Integration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  SMPP Gateway Manager                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  External Client ──(Step 1)──> SMPPBox ──────────┐         │
│  (SMPP Port 2775)              (Port 2775)       │         │
│                                                  │         │
│  ┌──────────────────────────────────────────────▼─────┐   │
│  │            BearerBox (Routing Engine)             │   │
│  │         Port 13001 (internal box comm)            │   │
│  └──────────────────────────────────────────────┬─────┘   │
│                                                  │         │
│        ┌─────────────┬────────────┬─────────────┘         │
│        │             │            │                        │
│        ▼             ▼            ▼                        │
│     SMSBox       SQLBox       Logger                       │
│  (HTTP/SMPP)   (MySQL Logs)   (Database)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌────────────────────────────────┐
              │  External Operator/Supplier    │
              │  (SMPP Port 2775)              │
              └────────────────────────────────┘
```

### Components

#### 1. **BearerBox** (Main Routing Engine)
- Central message router
- Connects all components (SMPPBox, SMSBox, SQLBox)
- Routes messages between clients and suppliers
- Admin port: 13001

**Start:** `bearerbox -v 1 /etc/kannel/kannel.conf`

#### 2. **SMPPBox** (SMPP Server)
- Accepts connections from external SMPP clients
- Listens on port 2775 by default
- Supports SMPP v3.4 protocol
- Validates credentials from `/etc/kannel/smpp-logins.conf`

**Start:** `smppbox -v 1 /etc/kannel/smppbox.conf`

#### 3. **SQLBox** (Database Integration)
- Logs all MO (Mobile Originated) and MT (Mobile Terminated) messages
- Stores in MySQL/MariaDB
- Tables: `mo_messages`, `mt_messages`
- Enables billing and reporting

**Start:** `sqlbox -v 1 /etc/kannel/kannel.conf`

#### 4. **SMSBox** (Application Gateway)
- HTTP and SMPP send interface
- Handles send_sms HTTP requests
- Port 13013 for HTTP sendsms

**Start:** `smsbox -v 1 /etc/kannel/kannel.conf`

### Adding SMPP Clients

#### Via Web Panel
1. Go to **Clients** → **Add Client**
2. Select Type: **SMPP**
3. Set **System ID** and **Password**
4. Set **IP** (client IP or 0.0.0.0 for any)
5. Set **Port** 2775
6. Set **TPS** (throughput limit)
7. Save

#### Update SMPP Logins File

```bash
# Auto-generated from web panel configs
cat > /etc/kannel/smpp-logins.conf <<EOF
# Client 1
group = smpp-logins
smpp-logins-username = client1
smpp-logins-password = password123
smpp-logins-throughput = 100

# Client 2
group = smpp-logins
smpp-logins-username = client2
smpp-logins-password = password456
smpp-logins-throughput = 50
EOF

# Reload SMPPBox
sudo systemctl restart smppbox
```

### Adding Supplier Routes

1. Go to **Suppliers** → **Add Supplier**
2. Select Type: **SMPP** (or HTTP/DEVICE/PAIR)
3. Set **Host** and **Port** of supplier
4. Set **System ID** and **Password** for auth
5. Set **TPS** limit
6. Click **Test Connection** to validate
7. Save

Then create **Routes** to link Clients → Suppliers

---

## Database Setup

### Database Schema

Automatically created during installation via Prisma migrations.

```sql
-- Core tables
users                  -- Admin users
clients                -- SMPP client connections
suppliers              -- Supplier/operator connections
kannel_configs         -- Kannel component configs

-- SMPP Data
message_logs           -- All SMS transactions
mo_messages (Kannel)   -- Mobile Originated (Kannel SQLBox)
mt_messages (Kannel)   -- Mobile Terminated (Kannel SQLBox)

-- Billing
invoices               -- Generated client invoices
billing_transactions   -- Credit/debit history
rates                  -- Country/operator pricing

-- Configuration
routes                 -- Client->Supplier routing rules
translation_rules      -- Message transformation rules
kannel_configs         -- Kannel BearerBox/SMPPBox/SQLBox configs
smtp_configs           -- Email notification settings
company_settings       -- Invoice customization

-- Administration
audit_logs             -- User actions
campaigns              -- Bulk SMS campaigns
countries             -- Country/operator definitions
```

### Create Admin User

Already created during installation with default credentials. To change:

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Access MySQL
mysql -u smpp_user -p smpp_gateway
# Password: SmppGateway2026SecurePass

# Query existing users
SELECT id, name, email, role FROM users;

# Update password (via web panel is easier)
# Or manually via Node.js script
```

### Backup Database

```bash
# Full backup
mysqldump -u smpp_user -p smpp_gateway > /backup/smpp_$(date +%Y%m%d).sql

# Compressed backup
mysqldump -u smpp_user -p smpp_gateway | gzip > /backup/smpp_$(date +%Y%m%d).sql.gz

# Restore
mysql -u smpp_user -p smpp_gateway < /backup/smpp_20260509.sql
```

---

## Service Management

### View Status

```bash
# All services
pm2 status
systemctl status bearerbox smppbox smsbox sqlbox
journalctl -u bearerbox -u smppbox

# Specific service
systemctl status smppbox
pm2 status smpp-gateway
```

### Start/Stop/Restart

```bash
# Backend application
pm2 start smpp-gateway
pm2 stop smpp-gateway
pm2 restart smpp-gateway
pm2 logs smpp-gateway

# Kannel services
sudo systemctl start bearerbox smsbox smppbox sqlbox
sudo systemctl stop bearerbox smsbox smppbox sqlbox
sudo systemctl restart bearerbox

# Nginx
sudo systemctl restart nginx

# Database
sudo systemctl restart mariadb
```

### View Logs

```bash
# Backend application
pm2 logs smpp-gateway

# Real-time
pm2 logs smpp-gateway --lines 100 --err

# Kannel
tail -f /var/log/kannel/bearerbox.log
tail -f /var/log/kannel/smppbox.log
tail -f /var/log/kannel/sqlbox.log

# System journal
journalctl -fu smppbox
journalctl -fu bearerbox --no-pager | head -50

# Nginx
tail -f /var/log/nginx/error.log
```

### Monitor Performance

```bash
# Process usage
pm2 monit

# System resources
top -p $(pgrep -f "node.*smpp-gateway" | tr '\n' ',')
free -h
df -h

# Database connections
mysql -u smpp_user -p -e "SHOW PROCESSLIST;"

# Network connections to port 2775
netstat -tlnp | grep 2775
ss -tlnp | grep 2775
```

---

## Configuration

### Environment Variables (.env)

Located at `/opt/smpp-gateway/backend/.env`

```bash
# Server
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_URL="mysql://smpp_user:SmppGateway2026SecurePass@localhost:3306/smpp_gateway"

# JWT Authentication
JWT_SECRET=your_super_secret_key_here_min_64_chars
JWT_EXPIRES_IN=24h

# SMPP Server (listens for external clients)
SMPP_HOST=0.0.0.0
SMPP_PORT=2775
SMPP_SYSTEM_ID=smpp_gateway
SMPP_PASSWORD=smpp_password

# Kannel
KANNEL_ADMIN_PASS=kannel_admin_password
KANNEL_STATUS_PASS=kannel_status_password
KANNEL_ADMIN_PORT=13000

# SMTP (Email notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_EMAIL=noreply@yourcompany.com
SMTP_FROM_NAME=SMPP Gateway

# Admin credentials (for initial setup)
ADMIN_EMAIL=admin@triangletrade.net
ADMIN_PASSWORD=Telco1984@s

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/smpp-gateway/app.log
```

### Change Admin Password

1. **Via Web Panel:**
   - Login
   - Settings → Change Password

2. **Via Database:**
   ```bash
   mysql -u smpp_user -p smpp_gateway
   # Password will be hashed with bcryptjs
   ```

### Enable HTTPS

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (Let's Encrypt)
sudo certbot certonly --nginx -d your.domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Update Nginx config
sudo nano /etc/nginx/sites-available/smpp-gateway
# Add:
# listen 443 ssl http2;
# ssl_certificate /etc/letsencrypt/live/your.domain.com/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;

sudo nginx -t && sudo systemctl reload nginx
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 2775
lsof -i :2775
sudo ss -tlnp | grep 2775

# Kill process
sudo kill -9 PID

# Or use different port in .env and Kannel config
```

### Database Connection Error

```bash
# Check MariaDB is running
sudo systemctl status mariadb

# Test connection
mysql -h localhost -u smpp_user -p smpp_gateway -e "SELECT 1;"

# Check DATABASE_URL in .env
cat /opt/smpp-gateway/backend/.env | grep DATABASE_URL

# Verify credentials
mysql -u root -p -e "SHOW GRANTS FOR 'smpp_user'@'localhost';"
```

### SMPPBox Not Accepting Connections

```bash
# Check SMPPBox is running
sudo systemctl status smppbox

# Check logs
tail -50 /var/log/kannel/smppbox.log

# Check port 2775 is listening
sudo ss -tlnp | grep 2775

# Firewall issue?
sudo ufw status | grep 2775

# Check config syntax
smppbox -v 5 /etc/kannel/smppbox.conf 2>&1 | head -100
```

### BearerBox Segfault

If BearerBox crashes with segmentation fault:

```bash
# Check recent logs
journalctl -u bearerbox -n 50

# Rebuild Kannel from source (may be version issue)
cd /tmp
wget http://www.kannel.org/download/1.4.5/gateway-1.4.5.tar.gz
tar -xzf gateway-1.4.5.tar.gz
cd gateway-1.4.5
./configure --prefix=/usr --with-mysql --enable-ssl
make -j4 && sudo make install

# Restart
sudo systemctl restart bearerbox
```

### SMPP Client Can't Bind

1. **Check client credentials in web panel**
   - Verify System ID and Password

2. **Check SMPP logins file**
   ```bash
   cat /etc/kannel/smpp-logins.conf
   ```

3. **Check firewall allows port 2775 from client IP**
   ```bash
   sudo ufw allow from CLIENT_IP to any port 2775
   ```

4. **Enable debug logs**
   ```bash
   # In /etc/kannel/smppbox.conf
   log-level = 5  # Very verbose
   
   sudo systemctl restart smppbox
   tail -f /var/log/kannel/smppbox.log
   ```

5. **Test connection manually**
   ```bash
   # From client machine
   telnet YOUR_SERVER_IP 2775
   # Should connect
   ```

### High Memory Usage

```bash
# Check what's using RAM
top -o %MEM

# Restart Node.js app
pm2 restart smpp-gateway

# Check for memory leaks
pm2 logs smpp-gateway | grep -i "memory\|heap"

# Increase max memory before restart
pm2 delete smpp-gateway
pm2 start /opt/smpp-gateway/backend/dist/index.js --name smpp-gateway --max-memory-restart 1G
pm2 save
```

### Nginx 502 Bad Gateway

```bash
# Check backend is running
pm2 status

# Check if port 3001 is listening
sudo ss -tlnp | grep 3001

# Check Nginx error log
tail -50 /var/log/nginx/error.log

# Restart both
pm2 restart smpp-gateway
sudo systemctl restart nginx

# Check connectivity
curl http://127.0.0.1:3001/health
```

---

## Backup & Recovery

### Automated Backup Script

```bash
#!/bin/bash
# /usr/local/bin/backup-smpp.sh

BACKUP_DIR="/backups/smpp-gateway"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Database
mysqldump -u smpp_user -p"SmppGateway2026SecurePass" smpp_gateway | \
  gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz /opt/smpp-gateway

# Kannel config
tar -czf $BACKUP_DIR/kannel_$DATE.tar.gz /etc/kannel

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

Make executable and add to crontab:

```bash
sudo chmod +x /usr/local/bin/backup-smpp.sh
sudo crontab -e

# Add:
0 2 * * * /usr/local/bin/backup-smpp.sh 2>&1 | logger -t smpp-backup
```

### Restore from Backup

```bash
# List backups
ls -lh /backups/smpp-gateway/

# Restore database
gunzip < /backups/smpp-gateway/db_20260509_020000.sql.gz | \
  mysql -u smpp_user -p smpp_gateway

# Restore application
cd /
sudo tar -xzf /backups/smpp-gateway/app_20260509_020000.tar.gz

# Restart services
pm2 restart smpp-gateway
sudo systemctl restart bearerbox
```

---

## Security

### Change Default Credentials

**CRITICAL:** Change immediately after installation!

```bash
# 1. Change admin password (via web panel or database)
# Web Panel: Settings → Security → Change Password

# 2. Change database password
ALTER USER 'smpp_user'@'localhost' IDENTIFIED BY 'NewSecurePassword123!';
FLUSH PRIVILEGES;

# Update .env
sed -i 's/SmppGateway2026SecurePass/NewSecurePassword123!/g' \
  /opt/smpp-gateway/backend/.env

pm2 restart smpp-gateway

# 3. Change Kannel admin passwords
sudo sed -i 's/your_admin_password/KannelAdminPass123!/g' /etc/kannel/kannel.conf
sudo sed -i 's/your_status_password/KannelStatusPass123!/g' /etc/kannel/kannel.conf
sudo systemctl restart bearerbox
```

### Firewall Rules

```bash
# Restrict to specific IPs
sudo ufw delete allow 2775/tcp
sudo ufw allow from 192.168.1.100 to any port 2775 comment "Client A"
sudo ufw allow from 203.0.113.50 to any port 2775 comment "Supplier B"

# Allow SSH only from specific IP
sudo ufw delete allow 22/tcp
sudo ufw allow from YOUR_IP to any port 22

# Review rules
sudo ufw status numbered
```

### SSL/TLS for SMPP

Edit Kannel config to use TLS:

```bash
# /etc/kannel/kannel.conf
group = smppbox
...
use-ssl = true
ssl-certkey-file = /etc/ssl/certs/smpp.pem
ssl-password = your_certificate_password
```

### Fail2Ban (Block Brute Force)

```bash
sudo apt install -y fail2ban

# Create jail for SMPP
sudo cat > /etc/fail2ban/jail.d/smppbox.conf <<'EOF'
[smppbox]
enabled = true
port = 2775
filter = smppbox
logpath = /var/log/kannel/smppbox.log
maxretry = 5
findtime = 3600
bantime = 86400
EOF

sudo systemctl restart fail2ban
```

### Regular Updates

```bash
# Weekly security updates
sudo apt update && sudo apt upgrade -y

# Node packages
cd /opt/smpp-gateway
npm outdated
npm update
npm audit fix

# Database optimization (monthly)
sudo mysqlcheck -u root -p --all-databases --optimize
```

---

## API Reference

### Base URL
```
http://YOUR_SERVER_IP/api
```

### Authentication
```bash
# Login
POST /api/auth/login
{
  "email": "admin@triangletrade.net",
  "password": "Telco1984@s"
}

# Returns JWT token for subsequent requests
Authorization: Bearer <JWT_TOKEN>
```

### Core Endpoints

#### Clients
```bash
GET    /api/clients                    # List all
POST   /api/clients                    # Create
PUT    /api/clients/{id}               # Update
DELETE /api/clients/{id}               # Delete
POST   /api/clients/{id}/test-bind     # Test SMPP bind
```

#### Suppliers
```bash
GET    /api/suppliers                  # List all
POST   /api/suppliers                  # Create
PUT    /api/suppliers/{id}             # Update
DELETE /api/suppliers/{id}             # Delete
POST   /api/suppliers/{id}/connect     # Test connection
```

#### Message Logs
```bash
GET    /api/logs                       # List with filters
GET    /api/logs?status=DELIVERED      # Filter by status
GET    /api/logs?clientId={id}         # Filter by client
```

#### Billing
```bash
GET    /api/billing/summary            # Revenue/client overview
POST   /api/billing/transactions       # Add credit/debit
GET    /api/billing/invoices           # List invoices
POST   /api/billing/invoices/generate  # Generate invoice
```

#### Kannel
```bash
GET    /api/kannel                     # List configurations
POST   /api/kannel                     # Create config
PUT    /api/kannel/{id}                # Update config
GET    /api/kannel/generate/full       # Generate full kannel.conf
POST   /api/kannel/apply               # Apply config to file
GET    /api/kannel/status/services     # Service status
POST   /api/kannel/restart             # Restart services
```

---

## Support & Resources

- **GitHub:** https://github.com/eliasewu/SMPP-Gateway
- **Documentation:** https://github.com/eliasewu/SMPP-Gateway/wiki
- **Issues:** https://github.com/eliasewu/SMPP-Gateway/issues
- **Company:** Tri Angle Trade Centre FZE LLC

---

## License & Disclaimer

© 2026 Tri Angle Trade Centre FZE LLC. All rights reserved.

This software is provided "AS IS" without warranty of any kind. Use at your own risk. Ensure proper backups and testing before production deployment.

---

**Last Updated:** May 2026  
**Version:** 2.0.0
