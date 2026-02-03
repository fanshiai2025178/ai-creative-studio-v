#!/bin/bash

# ========================================
# AI Creative Studio V2 - 一键部署脚本
# ========================================

set -e  # 遇到错误立即退出

echo "🚀 开始部署 AI Creative Studio V2..."

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ 请使用 root 用户或 sudo 运行此脚本${NC}"
    exit 1
fi

# 项目目录
PROJECT_DIR="/usr/share/nginx/ai-creative-studio-v2"

# ========================================
# 1. 检查必要的软件
# ========================================
echo -e "\n${YELLOW}📦 检查必要的软件...${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚙️  安装 Node.js 20.x...${NC}"
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
else
    echo -e "${GREEN}✅ Node.js 已安装: $(node -v)${NC}"
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚙️  安装 pnpm...${NC}"
    npm install -g pnpm
else
    echo -e "${GREEN}✅ pnpm 已安装: $(pnpm -v)${NC}"
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚙️  安装 PM2...${NC}"
    npm install -g pm2
else
    echo -e "${GREEN}✅ PM2 已安装: $(pm2 -v)${NC}"
fi

# 检查 MySQL
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}⚙️  安装 MySQL...${NC}"
    yum install -y mysql-server
    systemctl start mysqld
    systemctl enable mysqld
    echo -e "${GREEN}✅ MySQL 已安装${NC}"
    echo -e "${YELLOW}⚠️  请运行以下命令设置 MySQL 密码：${NC}"
    echo -e "   sudo mysql_secure_installation"
else
    echo -e "${GREEN}✅ MySQL 已安装${NC}"
fi

# 检查 Nginx
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}⚙️  安装 Nginx...${NC}"
    yum install -y nginx
    systemctl start nginx
    systemctl enable nginx
else
    echo -e "${GREEN}✅ Nginx 已安装${NC}"
fi

# ========================================
# 2. 克隆或更新项目
# ========================================
echo -e "\n${YELLOW}📥 获取项目代码...${NC}"

if [ -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}📂 项目目录已存在，拉取最新代码...${NC}"
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo -e "${YELLOW}📂 克隆项目...${NC}"
    cd /usr/share/nginx
    git clone https://github.com/fanshiai2025178/ai-creative-studio-v2.git
    cd "$PROJECT_DIR"
fi

# ========================================
# 3. 配置环境变量
# ========================================
echo -e "\n${YELLOW}⚙️  配置环境变量...${NC}"

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 .env 文件不存在，从模板创建...${NC}"
    cp .env.example .env
    echo -e "${RED}⚠️  请编辑 .env 文件并填写正确的配置！${NC}"
    echo -e "   vim $PROJECT_DIR/.env"
    read -p "按 Enter 继续编辑，或按 Ctrl+C 取消..."
    vim .env
else
    echo -e "${GREEN}✅ .env 文件已存在${NC}"
fi

# ========================================
# 4. 安装依赖
# ========================================
echo -e "\n${YELLOW}📦 安装项目依赖...${NC}"
pnpm install

# ========================================
# 5. 数据库迁移
# ========================================
echo -e "\n${YELLOW}🗄️  运行数据库迁移...${NC}"
pnpm run db:push

# ========================================
# 6. 构建项目
# ========================================
echo -e "\n${YELLOW}🔨 构建项目...${NC}"
pnpm run build

# ========================================
# 7. 启动服务
# ========================================
echo -e "\n${YELLOW}🚀 启动服务...${NC}"

# 停止旧服务（如果存在）
pm2 delete ai-comic-studio 2>/dev/null || true

# 启动新服务
pm2 start dist/index.js --name "ai-comic-studio"
pm2 save

# 设置开机自启
pm2 startup systemd -u root --hp /root

# ========================================
# 8. 配置 Nginx
# ========================================
echo -e "\n${YELLOW}🌐 配置 Nginx...${NC}"

NGINX_CONF="/etc/nginx/conf.d/fanshai.com.cn.conf"

if [ ! -f "$NGINX_CONF" ]; then
    echo -e "${YELLOW}📝 创建 Nginx 配置文件...${NC}"
    cat > "$NGINX_CONF" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    
    server_name fanshai.com.cn www.fanshai.com.cn api.fanshai.com.cn;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    client_max_body_size 200M;
}
EOF
else
    echo -e "${GREEN}✅ Nginx 配置文件已存在${NC}"
fi

# 测试 Nginx 配置
echo -e "${YELLOW}🧪 测试 Nginx 配置...${NC}"
nginx -t

# 重新加载 Nginx
echo -e "${YELLOW}🔄 重新加载 Nginx...${NC}"
systemctl reload nginx

# ========================================
# 9. 配置防火墙
# ========================================
echo -e "\n${YELLOW}🔥 配置防火墙...${NC}"
firewall-cmd --add-service=http --permanent 2>/dev/null || true
firewall-cmd --add-service=https --permanent 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true

# ========================================
# 10. 完成
# ========================================
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 部署完成！${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${YELLOW}📊 服务状态：${NC}"
pm2 status

echo -e "\n${YELLOW}🌐 访问地址：${NC}"
echo -e "   http://fanshai.com.cn"

echo -e "\n${YELLOW}📝 查看日志：${NC}"
echo -e "   pm2 logs ai-comic-studio"

echo -e "\n${YELLOW}🔄 重启服务：${NC}"
echo -e "   pm2 restart ai-comic-studio"

echo -e "\n${YELLOW}⚙️  下一步（可选）：${NC}"
echo -e "   1. 配置 SSL 证书：sudo certbot --nginx -d fanshai.com.cn"
echo -e "   2. 设置数据库备份：crontab -e"
echo -e ""
