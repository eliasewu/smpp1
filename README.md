# SMPP Gateway Manager v2

**Professional-Grade SMPP/HTTP SMS Gateway Management System**  
*With Kannel Integration, Real-time Monitoring, Billing, and Advanced Routing*

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Debian](https://img.shields.io/badge/OS-Debian%2011%2F12%2F13-green)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![License](https://img.shields.io/badge/license-Proprietary-red)

---

## 🚀 Features

### 🎯 Core SMS Gateway
- **SMPP v3.4 Protocol** - Client/server mode for external SMPP connections
- **Multiple Connection Types** - SMPP, HTTP, Device, Pair mode support
- **TPS Management** - Per-client throughput limiting (1-10000 TPS)
- **Automatic Routing** - Destination-based message routing to suppliers
- **DLR Handling** - Delivery report generation and tracking
- **Message Status Tracking** - Real-time message state monitoring

### 🔌 Kannel Integration (Full Stack)
- **BearerBox** - Central routing engine
- **SMPPBox** - SMPP server accepting external client connections (port 2775)
- **SQLBox** - Automatic message logging to MySQL (mo/mt tables)
- **SMSBox** - HTTP application gateway for web-based sending
- **Architecture** - Complete client → SMPPBox → BearerBox → Supplier flow

### 💰 Billing & Finance
- **Auto-Invoicing** - Generate invoices from message logs
- **Balance Management** - Per-client credit tracking
- **Transaction History** - Complete audit trail of all charges
- **Rate Management** - Flexible per-destination pricing
- **Profit Tracking** - Cost vs revenue analysis
- **Report Generation** - Daily, weekly, monthly analytics

### 📊 Monitoring & Reporting
- **Live Dashboard** - Real-time traffic, revenue, supplier status
- **Message Logs** - Searchable real-time message tracking with Socket.IO
- **DLR Reports** - Delivery success rate analysis
- **Financial Reports** - Revenue by client, supplier, country
- **System Health** - CPU, memory, disk, database metrics
- **Bind Status** - Live SMPP connection status for all clients/suppliers

### 🔐 Security & Administration
- **JWT Authentication** - Secure token-based login
- **Role-Based Access** - Admin, Operator, Agent, User roles
- **IP Whitelist** - Per-client IP restrictions
- **Rate Limiting** - API and connection throttling
- **Audit Logs** - Complete action history
- **2FA Support** - Two-factor authentication ready

### 🌍 Advanced Routing
- **Multi-Supplier Routing** - Primary/backup routing per destination
- **Route Types** - OTP, Marketing, VoiceOTP, Gambling, Transactional
- **Failover Routing** - Automatic fallback to backup supplier
- **Translation Rules** - Number modification, content replacement, OTP extraction
- **Campaign Management** - Bulk SMS sending with scheduling

### 📱 Client Management
- **User Portal** - Web panel for clients to send SMS
- **API Access** - RESTful API for programmatic access
- **Webhook Support** - Receive DLR callbacks at specified URLs
- **Balance Alerts** - Automatic notifications on low balance
- **Usage Limits** - Set maximum daily/monthly usage per client

### 🎨 Modern Web Interface
- **React Dashboard** - Responsive, real-time UI
- **Dark Mode** - Eye-friendly dark theme
- **Mobile Responsive** - Works on phones, tablets, desktops
- **Real-time Updates** - WebSocket-powered live data
- **Interactive Charts** - Revenue trends, traffic patterns
- **Export Features** - Download reports as CSV/PDF

---

## 📋 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│             SMPP Gateway Manager v2 (Your Server)           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Frontend (React)          Backend (Node.js)                │
│  ├─ Web Panel              ├─ REST API                      │
│  ├─ Client Dashboard       ├─ WebSocket (live logs)         │
│  ├─ Reports               ├─ SMPP Server                    │
│  └─ Analytics             └─ Kannel Manager                 │
│       │                          │                          │
│       └───→ Nginx (Port 80/443)──→ Express.js (:3001)      │
│                                   └→ Prisma ORM             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│              Kannel SMS Gateway (Port 2775)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  BearerBox (Routing) ← SQLBox (Logging) ← SMPPBox (Server) │
│       │                                                     │
│       ├→ Supplier A (SMPP 2775)                            │
│       ├→ Supplier B (HTTP)                                 │
│       └→ Supplier C (Device/Pair)                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     MariaDB (MySQL)                          │
│   clients │ suppliers │ routes │ messages │ invoices        │
│   billing │ kannel_config │ users │ audit_logs             │
└─────────────────────────────────────────────────────────────┘

External Clients (SMPP 2775) → SMPPBox → BearerBox → Suppliers
```

---

## ⚡ Quick Start

### 1. Install (5-15 minutes)

```bash
# Download
git clone https://github.com/eliasewu/SMPP-Gateway.git
cd SMPP-Gateway

# Run installer
sudo bash scripts/install.sh

# Or automated remote install
curl -fsSL https://raw.githubusercontent.com/eliasewu/SMPP-Gateway/main/scripts/install.sh | sudo bash
```

### 2. Access

After installation:

| Component | URL | Default Credentials |
|-----------|-----|-------------------|
| **Web Panel** | `http://SERVER_IP` | admin@triangletrade.net / Telco1984@s |
| **SMPP Server** | `SERVER_IP:2775` | Per-client config |
| **BearerBox Admin** | `http://SERVER_IP:13000/status.html` | N/A |
| **API** | `http://SERVER_IP/api` | JWT token auth |

### 3. Configure First Client

1. Login to web panel
2. Go to **Clients** → **Add Client**
3. Set SMPP username/password
4. Set IP address whitelist
5. Add rate (sell price per SMS)
6. Add route (supplier for delivery)
7. Test SMPP connection

### 4. Add Supplier

1. Go to **Suppliers** → **Add Supplier**
2. Enter SMPP credentials
3. Test bind connection
4. Add rates (cost per SMS)
5. Use in routes for clients

### 5. Test SMS Flow

1. **Web Panel**: Tools → Test SMS
2. **Direct SMPP**: Use smpp-client to test bind and submit_sm
3. **Check Logs**: Live Logs tab shows all messages

---

## 📦 Requirements

- **OS**: Debian 11, 12, or 13
- **CPU**: 2+ cores
- **RAM**: 2+ GB
- **Disk**: 20+ GB
- **Network**: 10+ Mbps
- **Database**: MariaDB 10.5+ (installed automatically)
- **Node.js**: 20.x LTS (installed automatically)

---

## 🔧 Components

### Node.js Backend
- **Framework**: Express.js
- **Database ORM**: Prisma
- **Authentication**: JWT + bcrypt
- **Real-time**: Socket.IO
- **SMPP**: `smpp` npm module (with Kannel fallback)
- **API Rate Limiting**: express-rate-limit

### Frontend
- **Framework**: React 18
- **UI Components**: Custom design system
- **State Management**: Context API + Redux-like store
- **Charts**: Recharts
- **Icons**: Lucide React

### Kannel (Optional but Recommended)
- **BearerBox**: Message routing engine
- **SMPPBox**: SMPP protocol handler
- **SQLBox**: Database integration
- **SMSBox**: Application gateway

### Database (MariaDB)
- **Schema**: 15+ tables for SMS, billing, users, routing
- **Kannel Tables**: mo_messages, mt_messages
- **Transactions**: Full ACID compliance

---

## 📚 Documentation

- **[Installation Guide](./INSTALLATION_GUIDE.md)** - Complete step-by-step
- **[Kannel Setup](./INSTALLATION_GUIDE.md#kannel-configuration)** - BearerBox/SMPPBox config
- **[API Reference](./docs/API.md)** - REST endpoints
- **[Troubleshooting](./INSTALLATION_GUIDE.md#troubleshooting)** - Common issues

---

## 🎯 Key Endpoints

### Authentication
```
POST   /api/auth/login                 - User login (email/password)
GET    /api/auth/me                    - Current user info
POST   /api/auth/logout                - Logout
```

### Clients
```
GET    /api/clients                    - List all clients
POST   /api/clients                    - Create client
PUT    /api/clients/:id                - Update client
DELETE /api/clients/:id                - Delete client
GET    /api/clients/:id/stats          - Client statistics
```

### Suppliers
```
GET    /api/suppliers                  - List suppliers
POST   /api/suppliers                  - Create supplier
POST   /api/suppliers/:id/connect      - Test SMPP bind
GET    /api/suppliers/status/bind      - All bind statuses
```

### Messages
```
GET    /api/logs                       - Message logs
POST   /api/logs/submit                - Log new message
GET    /api/logs/stats                 - Daily statistics
```

### Billing
```
GET    /api/billing/summary            - Financial overview
GET    /api/billing/invoices           - List invoices
POST   /api/billing/invoices/generate  - Auto-generate invoice
GET    /api/billing/transactions       - Transaction history
POST   /api/billing/transactions       - Add credit/debit
GET    /api/billing/reports/daily      - Daily report
```

### Kannel
```
GET    /api/kannel                     - List Kannel configs
POST   /api/kannel                     - Create config
GET    /api/kannel/generate/full       - Generate full kannel.conf
POST   /api/kannel/apply               - Apply to /etc/kannel/
POST   /api/kannel/restart             - Restart services
```

---

## 🚀 Deployment

### Single Server (Recommended for <100K msgs/day)
```bash
# Everything on one server
sudo bash scripts/install.sh

# Services running:
# - MariaDB (database)
# - Node.js backend (API + SMPP module)
# - Nginx (web + proxy)
# - Kannel (BearerBox, SMPPBox, SMSBox, SQLBox)
```

### High-Availability
For large deployments, separate:
- **Database Server** (MariaDB replication)
- **App Servers** (Node.js cluster, load-balanced)
- **Kannel Servers** (Dedicated BearerBox, SMPPBox instances)
- **Cache Layer** (Redis for rate limiting)

---

## 🔒 Security Best Practices

1. **Change Default Passwords** after install
2. **Enable HTTPS** - Use Let's Encrypt (automated in Nginx)
3. **Setup UFW Firewall** - Restrict ports 2775, 80, 443 to known IPs
4. **Database Security** - Change MariaDB root password, disable remote access
5. **API Rate Limiting** - Configured per-endpoint
6. **JWT Secrets** - Use strong, unique JWT_SECRET in .env
7. **Audit Logs** - Monitor /var/log/kannel/ and pm2 logs regularly
8. **Backups** - Automated database backups recommended

---

## 📞 Support

| Channel | Link |
|---------|------|
| **Email** | support@triangletrade.net |
| **GitHub Issues** | github.com/eliasewu/SMPP-Gateway/issues |
| **Documentation** | See INSTALLATION_GUIDE.md |
| **Community** | GitHub Discussions |

---

## 📜 License

Proprietary - All rights reserved to Tri Angle Trade Centre FZE LLC

---

## 🙏 Credits

**Built with**:
- Node.js & Express.js
- React
- Kannel SMS Gateway
- MariaDB
- Nginx
- PM2 Process Manager

**Author**: Tri Angle Trade Centre FZE LLC

---

## 🎉 What's New in v2.0

✨ **Major Release** - Complete rewrite with production-ready features

- ✅ Full Kannel integration (BearerBox, SMPPBox, SQLBox, SMSBox)
- ✅ Enhanced billing system with auto-invoicing
- ✅ Real-time message logging with Socket.IO
- ✅ Comprehensive financial reporting
- ✅ Improved web UI (React 18)
- ✅ Better database schema (Prisma)
- ✅ Automated Debian installer (5-15 min install)
- ✅ Security enhancements (JWT, rate limiting, audit logs)
- ✅ Live bind status monitoring
- ✅ Docker-ready setup

---

**Version**: 2.0.0  
**Release Date**: May 2026  
**Stable**: ✅ Production-Ready
