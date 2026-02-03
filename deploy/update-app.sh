#!/bin/bash

# ============================================================
# AI 创意工作室 - 快速更新脚本
# 用于从 GitHub 拉取最新代码并重新部署
# ============================================================

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 配置
PROJECT_DIR="/var/www/ai-creative-studio"

# 进入项目目录
cd ${PROJECT_DIR}

info "正在拉取最新代码..."
git pull origin main

info "正在安装依赖..."
npm install

info "正在构建项目..."
npm run build

info "正在重启应用..."
pm2 restart all

success "更新完成！"

# 显示应用状态
pm2 list
