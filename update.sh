#!/bin/bash

# ========================================
# AI Creative Studio V2 - 快速更新脚本
# ========================================

set -e

echo "🔄 开始更新 AI Creative Studio V2..."

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="/usr/share/nginx/ai-creative-studio-v2"

cd "$PROJECT_DIR"

# 1. 拉取最新代码
echo -e "${YELLOW}📥 拉取最新代码...${NC}"
git pull origin main

# 2. 安装依赖
echo -e "${YELLOW}📦 更新依赖...${NC}"
pnpm install

# 3. 数据库迁移（如果有）
echo -e "${YELLOW}🗄️  运行数据库迁移...${NC}"
pnpm run db:push || true

# 4. 重新构建
echo -e "${YELLOW}🔨 重新构建...${NC}"
pnpm run build

# 5. 重启服务
echo -e "${YELLOW}🔄 重启服务...${NC}"
pm2 restart ai-comic-studio

# 6. 显示状态
echo -e "\n${GREEN}✅ 更新完成！${NC}\n"
pm2 status
pm2 logs ai-comic-studio --lines 20
