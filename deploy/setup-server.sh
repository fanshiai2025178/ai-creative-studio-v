#!/bin/bash

# ============================================================
# AI 创意工作室 - Hostinger VPS 一键部署脚本
# 适用于：Ubuntu 24.04 LTS
# 服务器位置：美国（可直接访问 Google Gemini API）
# ============================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的信息
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================
# 配置变量（请根据实际情况修改）
# ============================================================

# 项目配置
PROJECT_NAME="ai-creative-studio"
PROJECT_DIR="/var/www/${PROJECT_NAME}"
GITHUB_REPO="https://github.com/fanshiai2025178/ai-creative-studio-v2.git"

# 数据库配置
MYSQL_ROOT_PASSWORD="FanShai2026VPS@Pass"
MYSQL_DATABASE="ai_comic"

# Node.js 版本
NODE_VERSION="20"

# ============================================================
# 第一步：系统更新和基础软件安装
# ============================================================

install_base_packages() {
    info "正在更新系统..."
    apt update && apt upgrade -y

    info "正在安装基础软件包..."
    apt install -y \
        curl \
        wget \
        git \
        vim \
        htop \
        unzip \
        build-essential \
        software-properties-common \
        ca-certificates \
        gnupg \
        lsb-release

    success "基础软件包安装完成"
}

# ============================================================
# 第二步：安装 Node.js
# ============================================================

install_nodejs() {
    info "正在安装 Node.js ${NODE_VERSION}..."
    
    # 添加 NodeSource 仓库
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    
    # 安装 Node.js
    apt install -y nodejs
    
    # 验证安装
    node_version=$(node -v)
    npm_version=$(npm -v)
    
    success "Node.js 安装完成: ${node_version}, npm: ${npm_version}"
    
    # 安装 pnpm（可选，如果项目使用）
    npm install -g pnpm
    
    # 安装 PM2
    info "正在安装 PM2..."
    npm install -g pm2
    
    success "PM2 安装完成"
}

# ============================================================
# 第三步：安装 MySQL
# ============================================================

install_mysql() {
    info "正在安装 MySQL..."
    
    # 安装 MySQL
    apt install -y mysql-server
    
    # 启动 MySQL
    systemctl start mysql
    systemctl enable mysql
    
    # 配置 MySQL root 密码和安全设置
    info "正在配置 MySQL..."
    
    mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';"
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "DELETE FROM mysql.user WHERE User='';"
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "DROP DATABASE IF EXISTS test;"
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;"
    
    # 创建项目数据库
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS ${MYSQL_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    
    success "MySQL 安装和配置完成"
}

# ============================================================
# 第四步：安装 Nginx
# ============================================================

install_nginx() {
    info "正在安装 Nginx..."
    
    apt install -y nginx
    
    # 启动 Nginx
    systemctl start nginx
    systemctl enable nginx
    
    success "Nginx 安装完成"
}

# ============================================================
# 第五步：克隆项目代码
# ============================================================

clone_project() {
    info "正在克隆项目代码..."
    
    # 创建项目目录
    mkdir -p /var/www
    
    # 如果目录已存在，先备份
    if [ -d "${PROJECT_DIR}" ]; then
        warning "项目目录已存在，正在备份..."
        mv ${PROJECT_DIR} ${PROJECT_DIR}.backup.$(date +%Y%m%d%H%M%S)
    fi
    
    # 克隆代码
    git clone ${GITHUB_REPO} ${PROJECT_DIR}
    
    success "项目代码克隆完成"
}

# ============================================================
# 第六步：配置环境变量
# ============================================================

setup_env() {
    info "正在配置环境变量..."
    
    # 创建 .env 文件
    cat > ${PROJECT_DIR}/.env << EOF
# 数据库配置
DATABASE_URL="mysql://root:${MYSQL_ROOT_PASSWORD}@localhost:3306/${MYSQL_DATABASE}"

# JWT 密钥（请修改为你自己的密钥）
JWT_SECRET="your-jwt-secret-key-change-this"

# 应用配置
PORT=3000
NODE_ENV=production
VITE_APP_ID=ai-creative-studio

# 阿里云 OSS 配置（如果需要继续使用阿里云 OSS）
# OSS_ACCESS_KEY_ID="your-oss-access-key-id"
# OSS_ACCESS_KEY_SECRET="your-oss-access-key-secret"
# OSS_BUCKET="your-oss-bucket"
# OSS_REGION="oss-cn-hangzhou"

# 注意：此版本部署在国外服务器，可直接访问 Google Gemini API
# 不需要配置 GEMINI_PROXY_URL
# 用户需要在注册时提供自己的 Gemini API Key
EOF

    warning "请编辑 ${PROJECT_DIR}/.env 文件，填入正确的配置信息！"
    success "环境变量模板创建完成"
}

# ============================================================
# 第七步：安装项目依赖并构建
# ============================================================

build_project() {
    info "正在安装项目依赖..."
    
    cd ${PROJECT_DIR}
    
    # 安装依赖
    npm install
    
    info "正在构建项目..."
    
    # 构建
    npm run build
    
    success "项目构建完成"
}

# ============================================================
# 第八步：配置 Nginx
# ============================================================

setup_nginx() {
    info "正在配置 Nginx..."
    
    # 创建 Nginx 配置文件
    cat > /etc/nginx/sites-available/${PROJECT_NAME} << 'EOF'
server {
    listen 80;
    server_name _;  # 替换为你的域名

    # 日志配置
    access_log /var/log/nginx/ai-creative-access.log;
    error_log /var/log/nginx/ai-creative-error.log;

    # 请求体大小限制（支持大图片上传）
    client_max_body_size 50M;

    # 反向代理到 Node.js 应用
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置（AI 生成需要较长时间）
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # 启用站点配置
    ln -sf /etc/nginx/sites-available/${PROJECT_NAME} /etc/nginx/sites-enabled/
    
    # 删除默认配置
    rm -f /etc/nginx/sites-enabled/default
    
    # 测试配置
    nginx -t
    
    # 重载 Nginx
    systemctl reload nginx
    
    success "Nginx 配置完成"
}

# ============================================================
# 第九步：配置 PM2 启动应用
# ============================================================

setup_pm2() {
    info "正在配置 PM2..."
    
    cd ${PROJECT_DIR}
    
    # 创建 PM2 配置文件
    cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'ai-creative-studio',
    script: '.output/server/index.mjs',
    cwd: '/var/www/ai-creative-studio',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

    # 启动应用
    pm2 start ecosystem.config.cjs
    
    # 保存 PM2 配置
    pm2 save
    
    # 设置 PM2 开机自启
    pm2 startup systemd -u root --hp /root
    
    success "PM2 配置完成，应用已启动"
}

# ============================================================
# 第十步：配置防火墙
# ============================================================

setup_firewall() {
    info "正在配置防火墙..."
    
    # 安装 ufw（如果没有）
    apt install -y ufw
    
    # 允许 SSH
    ufw allow ssh
    
    # 允许 HTTP
    ufw allow 80/tcp
    
    # 允许 HTTPS
    ufw allow 443/tcp
    
    # 启用防火墙
    echo "y" | ufw enable
    
    success "防火墙配置完成"
}

# ============================================================
# 主函数
# ============================================================

main() {
    echo ""
    echo "============================================================"
    echo "   AI 创意工作室 - Hostinger VPS 一键部署脚本"
    echo "   适用于：Ubuntu 24.04 LTS"
    echo "============================================================"
    echo ""
    
    # 检查是否为 root 用户
    if [ "$EUID" -ne 0 ]; then
        error "请使用 root 用户运行此脚本"
        exit 1
    fi
    
    # 执行安装步骤
    install_base_packages
    install_nodejs
    install_mysql
    install_nginx
    clone_project
    setup_env
    build_project
    setup_nginx
    setup_pm2
    setup_firewall
    
    echo ""
    echo "============================================================"
    success "部署完成！"
    echo "============================================================"
    echo ""
    echo "接下来请执行以下操作："
    echo ""
    echo "1. 编辑环境变量文件："
    echo "   nano ${PROJECT_DIR}/.env"
    echo ""
    echo "2. 填入正确的配置信息（JWT_SECRET、OSS 配置等）"
    echo ""
    echo "3. 重启应用："
    echo "   cd ${PROJECT_DIR} && pm2 restart all"
    echo ""
    echo "4. 配置域名（修改 Nginx 配置中的 server_name）："
    echo "   nano /etc/nginx/sites-available/${PROJECT_NAME}"
    echo "   systemctl reload nginx"
    echo ""
    echo "5. （可选）配置 SSL 证书："
    echo "   apt install certbot python3-certbot-nginx"
    echo "   certbot --nginx -d your-domain.com"
    echo ""
    echo "============================================================"
    echo "服务器信息："
    echo "  - 项目目录: ${PROJECT_DIR}"
    echo "  - MySQL 密码: ${MYSQL_ROOT_PASSWORD}"
    echo "  - 数据库名: ${MYSQL_DATABASE}"
    echo "============================================================"
    echo ""
}

# 运行主函数
main "$@"
