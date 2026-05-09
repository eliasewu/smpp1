#!/bin/bash
#######################################################################
# SMPP Gateway Manager v2 - Complete Installation Script
# Supports: Debian 11 (Bullseye), Debian 12 (Bookworm), Debian 13 (Trixie)
# Installs: Node.js, MariaDB, Nginx, Kannel (bearerbox/smsbox/smppbox/sqlbox)
# 
# Usage:
#   sudo bash install.sh
#   OR
#   curl -fsSL https://raw.githubusercontent.com/your-repo/main/scripts/install.sh | sudo bash
#
# Author: Tri Angle Trade Centre FZE LLC
#######################################################################

set -e

# ======================== COLORS ========================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ======================== CONFIG ========================
APP_DIR="/opt/smpp-gateway"
LOG_DIR="/var/log/smpp-gateway"
KANNEL_LOG="/var/log/kannel"
BACKEND_PORT=3001
SMPP_PORT=2775
KANNEL_ADMIN_PORT=13000
KANNEL_SMSBOX_PORT=13001
KANNEL_SENDSMS_PORT=13013

DB_ROOT_PASS="${DB_ROOT_PASS:-Telco1988}"
DB_APP_USER="smpp_user"
DB_APP_PASS="${DB_APP_PASS:-SmppGateway2026SecurePass}"
DB_NAME="smpp_gateway"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@triangletrade.net}"
ADMIN_PASS="${ADMIN_PASS:-Telco1984@s}"

# ======================== HELPERS ========================
log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_skip()  { echo -e "${CYAN}[→]${NC} $1 — skipped"; }
log_step()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  $1\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

print_banner() {
    clear
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║     SMPP Gateway Manager v2 — Complete Debian Installer      ║"
    echo "║         With Kannel (BearerBox/SMSBox/SMPPBox/SQLBox)        ║"
    echo "║              Tri Angle Trade Centre FZE LLC                  ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_root() {
    [ "$EUID" -ne 0 ] && { log_error "Run as root: sudo $0"; exit 1; }
}

detect_system() {
    log_step "Detecting System"
    . /etc/os-release 2>/dev/null || { log_error "Cannot detect OS"; exit 1; }
    [ "$ID" != "debian" ] && { log_error "Debian only. Detected: $ID"; exit 1; }
    SERVER_IP=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')
    [ -z "$SERVER_IP" ] && SERVER_IP="127.0.0.1"
    FREE_DISK=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
    TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
    log_info "OS: Debian $VERSION_ID ($VERSION_CODENAME)"
    log_info "IP: $SERVER_IP | RAM: ${TOTAL_RAM}MB | Disk: ${FREE_DISK}GB | CPUs: $(nproc)"
    [ "$FREE_DISK" -lt 5 ] && { log_error "Need 5GB+ free disk"; exit 1; }
    [ "$TOTAL_RAM" -lt 512 ] && { log_warn "Low RAM: ${TOTAL_RAM}MB. Recommended 2GB+"; }
}

# ======================== PACKAGES ========================

install_packages() {
    log_step "System Packages"
    apt-get update -qq >/dev/null 2>&1
    local needed=""
    for pkg in curl wget git gnupg2 ca-certificates build-essential ufw nginx \
               mariadb-server mariadb-client openssl libssl-dev \
               autoconf automake libtool pkg-config libxml2-dev \
               libssl-dev libgdbm-dev flex bison libpcre3-dev; do
        dpkg -l "$pkg" 2>/dev/null | grep -q "^ii" || needed="$needed $pkg"
    done
    if [ -n "$needed" ]; then
        log_info "Installing:$needed"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $needed >/dev/null 2>&1
        log_info "Packages installed"
    else
        log_skip "All packages already present"
    fi
}

install_nodejs() {
    log_step "Node.js 20.x LTS & PM2"
    if command -v node &>/dev/null; then
        local ver=$(node --version | cut -dv -f2 | cut -d. -f1)
        if [ "$ver" -ge 20 ]; then
            log_skip "Node.js $(node --version) already installed"
        else
            log_info "Upgrading Node.js to v20..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
            apt-get install -y nodejs -qq >/dev/null 2>&1
        fi
    else
        log_info "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
        apt-get install -y nodejs -qq >/dev/null 2>&1
    fi
    log_info "Node.js $(node --version) | npm $(npm --version)"
    command -v pm2 &>/dev/null || npm install -g pm2 --silent >/dev/null 2>&1
    log_info "PM2 $(pm2 --version 2>/dev/null) ready"
}

# ======================== KANNEL ========================

install_kannel() {
    log_step "Kannel SMS Gateway (BearerBox/SMSBox/SMPPBox/SQLBox)"

    # Check if already installed
    if command -v bearerbox &>/dev/null && command -v smppbox &>/dev/null; then
        log_skip "Kannel already installed: $(bearerbox --version 2>&1 | head -1)"
        return
    fi

    log_info "Installing Kannel from apt..."
    # Try apt first
    if apt-cache show kannel &>/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq kannel kannel-sqlbox >/dev/null 2>&1
        log_info "Kannel installed from apt"
    else
        # Build from source if not available
        log_warn "Kannel not in apt, building from source..."
        install_kannel_from_source
    fi

    # Install smppbox (if not bundled)
    install_smppbox

    # Create log directory
    mkdir -p "$KANNEL_LOG"
    chown -R www-data:www-data "$KANNEL_LOG" 2>/dev/null || true

    log_info "Kannel components ready"
}

install_kannel_from_source() {
    log_info "Building Kannel from source..."
    local KANNEL_VER="1.4.5"
    local KANNEL_SRC="/tmp/kannel-${KANNEL_VER}"

    if [ ! -f "/tmp/gateway-${KANNEL_VER}.tar.gz" ]; then
        wget -q "http://www.kannel.org/download/${KANNEL_VER}/gateway-${KANNEL_VER}.tar.gz" \
            -O "/tmp/gateway-${KANNEL_VER}.tar.gz" || {
            log_error "Failed to download Kannel. Check network."
            return 1
        }
    fi

    cd /tmp && tar -xzf "gateway-${KANNEL_VER}.tar.gz"
    cd "gateway-${KANNEL_VER}"
    ./configure --prefix=/usr --sysconfdir=/etc --with-mysql \
        --enable-ssl --disable-docs --disable-wap >/dev/null 2>&1
    make -j$(nproc) >/dev/null 2>&1
    make install >/dev/null 2>&1
    log_info "Kannel ${KANNEL_VER} built and installed"
}

install_smppbox() {
    if command -v smppbox &>/dev/null; then
        log_skip "smppbox already installed"
        return
    fi

    log_info "Building SMPPBox from source..."
    local SMPPBOX_SRC="/tmp/smppbox"
    
    if command -v git &>/dev/null; then
        git clone --quiet https://github.com/kannel-outreach/smppbox.git "$SMPPBOX_SRC" 2>/dev/null || {
            log_warn "Could not clone smppbox, skipping..."
            return
        }
        cd "$SMPPBOX_SRC"
        autoreconf -i >/dev/null 2>&1
        ./configure --prefix=/usr --with-kannel-dir=/usr >/dev/null 2>&1
        make -j$(nproc) >/dev/null 2>&1
        make install >/dev/null 2>&1
        log_info "SMPPBox installed"
    else
        log_warn "git not found, skipping smppbox build"
    fi
}

# ======================== DATABASE ========================

setup_database() {
    log_step "MariaDB Database"
    systemctl start mariadb 2>/dev/null || service mariadb start 2>/dev/null || true
    systemctl enable mariadb >/dev/null 2>&1 || true

    # Find auth method
    local MCMD=""
    if mysql -e "SELECT 1" &>/dev/null 2>&1; then
        MCMD="mysql"
    elif mysql -u root -p"${DB_ROOT_PASS}" -e "SELECT 1" &>/dev/null 2>&1; then
        MCMD="mysql -u root -p${DB_ROOT_PASS}"
    elif mysql -u root -e "SELECT 1" &>/dev/null 2>&1; then
        MCMD="mysql -u root"
    else
        # Try unix socket
        if sudo mysql -e "SELECT 1" &>/dev/null 2>&1; then
            MCMD="sudo mysql"
        else
            log_error "Cannot connect to MariaDB. Set DB_ROOT_PASS env variable."
            exit 1
        fi
    fi

    # Create DB if not exists
    if $MCMD -e "USE ${DB_NAME}" &>/dev/null 2>&1; then
        log_skip "Database '${DB_NAME}' exists"
    else
        $MCMD <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL
        log_info "Database '${DB_NAME}' created"
    fi

    # Create user
    $MCMD <<SQL
CREATE USER IF NOT EXISTS '${DB_APP_USER}'@'localhost' IDENTIFIED BY '${DB_APP_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_APP_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
    log_info "Database user '${DB_APP_USER}' configured"

    # Create Kannel SQLBox tables
    $MCMD ${DB_NAME} <<SQL
CREATE TABLE IF NOT EXISTS mo_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    momt ENUM('MO','MT') NOT NULL DEFAULT 'MO',
    sender VARCHAR(20),
    receiver VARCHAR(20),
    udhdata TEXT,
    msgdata TEXT,
    time BIGINT,
    smsc_id VARCHAR(64),
    service VARCHAR(64),
    account VARCHAR(64),
    id2 BIGINT,
    sms_type BIGINT DEFAULT 0,
    mclass BIGINT DEFAULT -1,
    mwi BIGINT DEFAULT -1,
    coding BIGINT DEFAULT 0,
    compress BIGINT DEFAULT 0,
    validity BIGINT DEFAULT -1,
    deferred BIGINT DEFAULT -1,
    dlr_mask BIGINT DEFAULT 0,
    dlr_url VARCHAR(255),
    pid BIGINT DEFAULT -1,
    alt_dcs BIGINT DEFAULT -1,
    rpi BIGINT DEFAULT -1,
    charset VARCHAR(64) DEFAULT 'UTF-8',
    boxc_id VARCHAR(64),
    binfo VARCHAR(64),
    meta_data TEXT,
    status VARCHAR(20) DEFAULT 'received',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_time (time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mt_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    momt ENUM('MO','MT') NOT NULL DEFAULT 'MT',
    sender VARCHAR(20),
    receiver VARCHAR(20),
    udhdata TEXT,
    msgdata TEXT,
    time BIGINT,
    smsc_id VARCHAR(64),
    service VARCHAR(64),
    account VARCHAR(64),
    id2 BIGINT,
    sms_type BIGINT DEFAULT 0,
    mclass BIGINT DEFAULT -1,
    mwi BIGINT DEFAULT -1,
    coding BIGINT DEFAULT 0,
    compress BIGINT DEFAULT 0,
    validity BIGINT DEFAULT -1,
    deferred BIGINT DEFAULT -1,
    dlr_mask BIGINT DEFAULT 0,
    dlr_url VARCHAR(255),
    pid BIGINT DEFAULT -1,
    alt_dcs BIGINT DEFAULT -1,
    rpi BIGINT DEFAULT -1,
    charset VARCHAR(64) DEFAULT 'UTF-8',
    boxc_id VARCHAR(64),
    binfo VARCHAR(64),
    meta_data TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_momt (momt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL
    log_info "Kannel SQLBox tables created"
}

# ======================== APP ========================

deploy_app() {
    log_step "Deploying SMPP Gateway Application"
    mkdir -p "$APP_DIR" "$LOG_DIR"

    # Clone from git if not present
    if [ ! -d "$APP_DIR/.git" ]; then
        if [ -d "$(pwd)/backend" ]; then
            log_info "Copying from current directory..."
            cp -r . "$APP_DIR/"
        else
            log_info "Cloning repository..."
            git clone --quiet https://github.com/eliasewu/SMPP-Gateway.git "$APP_DIR" || {
                log_error "Failed to clone. Copy files manually to $APP_DIR"
                exit 1
            }
        fi
    else
        log_info "Updating existing installation..."
        cd "$APP_DIR" && git pull --quiet 2>/dev/null || true
    fi

    cd "$APP_DIR"

    # Create .env
    if [ ! -f "$APP_DIR/backend/.env" ]; then
        JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
        cat > "$APP_DIR/backend/.env" <<ENV
NODE_ENV=production
PORT=${BACKEND_PORT}
HOST=0.0.0.0
DATABASE_URL="mysql://${DB_APP_USER}:${DB_APP_PASS}@localhost:3306/${DB_NAME}"
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
SMPP_HOST=0.0.0.0
SMPP_PORT=${SMPP_PORT}
SMPP_SYSTEM_ID=smpp_gateway
SMPP_PASSWORD=smpp_password
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASS}
SERVER_IP=${SERVER_IP}
DB_HOST=localhost
DB_NAME=${DB_NAME}
DB_USER=${DB_APP_USER}
DB_PASS=${DB_APP_PASS}
KANNEL_ADMIN_PASS=kannel_admin_$(openssl rand -hex 8)
KANNEL_STATUS_PASS=kannel_status_$(openssl rand -hex 8)
LOG_LEVEL=info
LOG_FILE=${LOG_DIR}/app.log
ENV
        log_info ".env created"
    else
        log_skip ".env already exists"
    fi

    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd "$APP_DIR/backend"
    npm install --silent >/dev/null 2>&1
    log_info "Backend deps installed"

    # Prisma migrations
    log_info "Running database migrations..."
    npx prisma generate >/dev/null 2>&1
    npx prisma migrate deploy >/dev/null 2>&1 || npx prisma db push --force-reset >/dev/null 2>&1 || {
        log_warn "Prisma migrate failed, trying db push..."
        DATABASE_URL="mysql://${DB_APP_USER}:${DB_APP_PASS}@localhost:3306/${DB_NAME}" \
            npx prisma db push >/dev/null 2>&1
    }
    log_info "Database schema applied"

    # Seed database
    log_info "Seeding admin user..."
    ADMIN_EMAIL="${ADMIN_EMAIL}" ADMIN_PASSWORD="${ADMIN_PASS}" \
        npx ts-node prisma/seed.ts >/dev/null 2>&1 || {
        log_warn "Seed via ts-node failed, trying compiled..."
        npm run db:seed >/dev/null 2>&1 || log_warn "Seed skipped"
    }

    # Build backend
    log_info "Building backend..."
    npm run build >/dev/null 2>&1 || log_warn "Build failed, will run with ts-node-dev"

    # Build frontend
    log_info "Building frontend..."
    cd "$APP_DIR"
    npm install --silent >/dev/null 2>&1
    npm run build >/dev/null 2>&1 || log_warn "Frontend build failed"
    log_info "Application deployed"
}

# ======================== KANNEL CONFIG ========================

configure_kannel() {
    log_step "Configuring Kannel"
    mkdir -p /etc/kannel "$KANNEL_LOG"

    # Main kannel.conf
    cat > /etc/kannel/kannel.conf <<KANNELCONF
# ============================================================
# KANNEL CONFIGURATION - SMPP Gateway Manager
# Generated: $(date)
# Server IP: ${SERVER_IP}
# Architecture: Client -> SMPPBox -> BearerBox -> Supplier
# ============================================================

# ============================================================
# CORE (BearerBox)
# ============================================================
group = core
admin-port = ${KANNEL_ADMIN_PORT}
admin-passwd = kannel_admin_password
status-password = kannel_status_password
log-file = ${KANNEL_LOG}/bearerbox.log
log-level = 1
box-allow-ip = 127.0.0.1
access-log = ${KANNEL_LOG}/access.log
store-file = /var/lib/kannel/store.file
store-dump-freq = 10

# ============================================================
# SQLBOX (Database Integration)
# ============================================================
group = sqlbox
bearerbox-host = 127.0.0.1
bearerbox-port = ${KANNEL_SMSBOX_PORT}
sqlbox-id = main_sqlbox
log-file = ${KANNEL_LOG}/sqlbox.log
log-level = 1
sql-driver = mysql
sql-host = localhost
sql-port = 3306
sql-database = ${DB_NAME}
sql-username = ${DB_APP_USER}
sql-password = ${DB_APP_PASS}
mo-table = mo_messages
mt-table = mt_messages

# ============================================================
# SMSBOX
# ============================================================
group = smsbox
bearerbox-host = 127.0.0.1
bearerbox-port = ${KANNEL_SMSBOX_PORT}
sendsms-port = ${KANNEL_SENDSMS_PORT}
sendsms-interface = 127.0.0.1
log-file = ${KANNEL_LOG}/smsbox.log
log-level = 1
reply-couldnotfetch = No
reply-couldnotrepresent = No
mo-recode = true
concatenation = true
max-messages = 10

group = sendsms-user
username = kannel_user
password = kannel_pass
concatenation = true
max-messages = 10

# ============================================================
# SMPPBox (Accepts client SMPP connections on port 2775)
# ============================================================
# NOTE: SMPPBox is a separate process (smppbox binary)
# It connects to bearerbox and handles SMPP v3.4 protocol
# Config file: /etc/kannel/smppbox.conf

# ============================================================
# SMSC - Add supplier entries below
# Example for a supplier:
# ============================================================
# group = smsc
# smsc = smpp
# smsc-id = supplier_name
# host = supplier.ip.address
# port = 2775
# transceiver-mode = 1
# smsc-username = username
# smsc-password = password
# system-type = VMA
# throughput = 100
# log-file = ${KANNEL_LOG}/smsc_supplier.log
KANNELCONF

    # SMPPBox config
    cat > /etc/kannel/smppbox.conf <<SMPPBOXCONF
# ============================================================
# SMPPBOX CONFIGURATION
# Accepts SMPP connections from external clients on port ${SMPP_PORT}
# ============================================================
group = smppbox
bearerbox-host = 127.0.0.1
bearerbox-port = ${KANNEL_SMSBOX_PORT}
smppbox-port = ${SMPP_PORT}
smppbox-id = main_smppbox
log-file = ${KANNEL_LOG}/smppbox.log
log-level = 1
smpp-logins = /etc/kannel/smpp-logins.conf
throughput = 500
SMPPBOXCONF

    # SMPPBox login file (populated dynamically via API)
    touch /etc/kannel/smpp-logins.conf
    log_info "Kannel config written to /etc/kannel/"

    # Create required directories
    mkdir -p /var/lib/kannel
    chown -R root:root /etc/kannel
    chmod 640 /etc/kannel/kannel.conf
    chmod 640 /etc/kannel/smppbox.conf

    log_info "Kannel configured"
}

# ======================== SYSTEMD SERVICES ========================

create_services() {
    log_step "Creating System Services"

    # BearerBox service
    cat > /etc/systemd/system/bearerbox.service <<SVC
[Unit]
Description=Kannel BearerBox SMS Gateway
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=root
ExecStart=/usr/sbin/bearerbox -v 1 /etc/kannel/kannel.conf
ExecStop=/bin/kill -TERM \$MAINPID
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

    # SMSBox service
    cat > /etc/systemd/system/smsbox.service <<SVC
[Unit]
Description=Kannel SMSBox
After=bearerbox.service
Wants=bearerbox.service

[Service]
Type=simple
User=root
ExecStart=/usr/sbin/smsbox -v 1 /etc/kannel/kannel.conf
ExecStop=/bin/kill -TERM \$MAINPID
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

    # SMPPBox service
    cat > /etc/systemd/system/smppbox.service <<SVC
[Unit]
Description=Kannel SMPPBox (SMPP Server)
After=bearerbox.service
Wants=bearerbox.service

[Service]
Type=simple
User=root
ExecStart=/usr/sbin/smppbox -v 1 /etc/kannel/smppbox.conf
ExecStop=/bin/kill -TERM \$MAINPID
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

    # SQLBox service
    cat > /etc/systemd/system/sqlbox.service <<SVC
[Unit]
Description=Kannel SQLBox (Database Integration)
After=bearerbox.service mariadb.service
Wants=bearerbox.service

[Service]
Type=simple
User=root
ExecStart=/usr/sbin/sqlbox -v 1 /etc/kannel/kannel.conf
ExecStop=/bin/kill -TERM \$MAINPID
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

    # App backend service
    cat > /etc/systemd/system/smpp-gateway.service <<SVC
[Unit]
Description=SMPP Gateway Manager Backend
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=/usr/bin/node dist/index.js
ExecStartPre=/bin/bash -c 'cd ${APP_DIR}/backend && npx prisma generate'
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC

    systemctl daemon-reload
    log_info "Systemd services created"
}

# ======================== NGINX ========================

configure_nginx() {
    log_step "Configuring Nginx"

    cat > /etc/nginx/sites-available/smpp-gateway <<NGINX
server {
    listen 80;
    server_name ${SERVER_IP} _;
    root ${APP_DIR}/dist;
    index index.html;

    # Frontend
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket (Socket.IO)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
    }

    # Security
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;
    client_max_body_size 50M;
}
NGINX

    ln -sf /etc/nginx/sites-available/smpp-gateway /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
    log_info "Nginx configured"
}

# ======================== FIREWALL ========================

configure_firewall() {
    log_step "Firewall (UFW)"
    if ! command -v ufw &>/dev/null; then
        log_skip "UFW not installed"
        return
    fi

    ufw --force reset >/dev/null 2>&1
    ufw default deny incoming >/dev/null 2>&1
    ufw default allow outgoing >/dev/null 2>&1
    ufw allow 22/tcp comment "SSH" >/dev/null 2>&1
    ufw allow 80/tcp comment "HTTP" >/dev/null 2>&1
    ufw allow 443/tcp comment "HTTPS" >/dev/null 2>&1
    ufw allow ${SMPP_PORT}/tcp comment "SMPP External Clients" >/dev/null 2>&1
    ufw allow ${BACKEND_PORT}/tcp comment "API Backend" >/dev/null 2>&1

    # Kannel ports (localhost only - managed by iptables)
    echo "y" | ufw enable >/dev/null 2>&1
    log_info "Firewall: SSH(22) HTTP(80) HTTPS(443) SMPP(${SMPP_PORT}) API(${BACKEND_PORT})"
}

# ======================== START SERVICES ========================

start_services() {
    log_step "Starting All Services"

    # Start MariaDB
    systemctl enable mariadb >/dev/null 2>&1 && systemctl restart mariadb 2>/dev/null
    log_info "MariaDB started"

    # Start app backend via PM2 (more reliable than systemd for Node)
    cd "$APP_DIR/backend"
    pm2 delete smpp-gateway 2>/dev/null || true
    
    if [ -f "dist/index.js" ]; then
        pm2 start dist/index.js --name smpp-gateway \
            --env production \
            --max-memory-restart 512M \
            --restart-delay 5000 >/dev/null 2>&1
    else
        pm2 start "npm run dev" --name smpp-gateway \
            --env production >/dev/null 2>&1
    fi
    pm2 save >/dev/null 2>&1
    pm2 startup systemd -u root --hp /root >/dev/null 2>&1 | bash >/dev/null 2>&1 || true
    log_info "SMPP Gateway backend started (PM2)"

    # Start Nginx
    systemctl enable nginx >/dev/null 2>&1 && systemctl restart nginx 2>/dev/null
    log_info "Nginx started"

    # Start Kannel services (if installed)
    if command -v bearerbox &>/dev/null; then
        systemctl enable bearerbox smsbox 2>/dev/null || true
        systemctl start bearerbox 2>/dev/null && log_info "BearerBox started" || log_warn "BearerBox failed to start"
        sleep 2
        systemctl start smsbox 2>/dev/null && log_info "SMSBox started" || log_warn "SMSBox failed to start"
        
        if command -v smppbox &>/dev/null; then
            systemctl enable smppbox 2>/dev/null || true
            systemctl start smppbox 2>/dev/null && log_info "SMPPBox started" || log_warn "SMPPBox failed to start"
        fi

        if command -v sqlbox &>/dev/null; then
            systemctl enable sqlbox 2>/dev/null || true
            systemctl start sqlbox 2>/dev/null && log_info "SQLBox started" || log_warn "SQLBox failed to start"
        fi
    else
        log_warn "Kannel binaries not found. SMPP handled by Node.js smpp module."
        log_warn "To install Kannel: apt-get install kannel kannel-sqlbox"
    fi
}

# ======================== SUMMARY ========================

print_summary() {
    echo ""
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║              ✅  INSTALLATION COMPLETE!                       ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║                                                               ║"
    printf "║  🌐  Web Panel:   http://%-37s║\n" "${SERVER_IP}"
    printf "║  🔑  Email:       %-40s║\n" "${ADMIN_EMAIL}"
    printf "║  🔑  Password:    %-40s║\n" "${ADMIN_PASS}"
    echo "║                                                               ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  SMPP Configuration                                           ║"
    printf "║  📡  SMPP Host:   %-40s║\n" "${SERVER_IP}"
    printf "║  📡  SMPP Port:   %-40s║\n" "${SMPP_PORT}"
    echo "║  📡  System ID:   (configured per client in web panel)       ║"
    echo "║                                                               ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  Kannel Services                                              ║"
    echo "║  • bearerbox  (routing engine)   port: internal              ║"
    echo "║  • smsbox     (app gateway)      port: 13001                 ║"
    echo "║  • smppbox    (smpp server)      port: ${SMPP_PORT}                 ║"
    echo "║  • sqlbox     (db integration)   mysql: ${DB_NAME}  ║"
    echo "║                                                               ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  Service Management                                           ║"
    echo "║  pm2 status           — App backend status                   ║"
    echo "║  pm2 logs smpp-gateway — App logs                            ║"
    echo "║  systemctl status bearerbox — Kannel status                  ║"
    echo "║  systemctl status smppbox   — SMPPBox status                 ║"
    echo "║  journalctl -fu smppbox     — SMPPBox live logs              ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ======================== MAIN ========================

main() {
    print_banner
    check_root
    detect_system
    install_packages
    install_nodejs
    install_kannel
    setup_database
    deploy_app
    configure_kannel
    create_services
    configure_nginx
    configure_firewall
    start_services
    print_summary
}

main "$@"
