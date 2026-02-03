#!/bin/bash
# ============================================================
# Gemini Balance Lite 代理服务部署脚本
# 用于在美国 VPS 上部署 Gemini API 代理服务
# ============================================================

set -e

# 配置变量
PROXY_PORT=${PROXY_PORT:-3001}
PROJECT_DIR="/root/gemini-balance-lite"
REPO_URL="https://github.com/fanshiai2025178/fanfan.git"

echo "=============================================="
echo "  Gemini Balance Lite 代理服务部署"
echo "=============================================="

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo "请使用 root 用户运行此脚本"
    exit 1
fi

# 检查 Git 是否安装
if ! command -v git &> /dev/null; then
    echo "正在安装 Git..."
    dnf install -y git
fi

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "正在安装 Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
fi

echo "Node.js 版本: $(node -v)"
echo "npm 版本: $(npm -v)"

# 安装 PM2（如果未安装）
if ! command -v pm2 &> /dev/null; then
    echo "正在安装 PM2..."
    npm install -g pm2
fi

# 克隆或更新项目
if [ -d "$PROJECT_DIR" ]; then
    echo "更新现有项目..."
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo "克隆项目..."
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# 安装依赖
echo "安装依赖..."
npm install

# 创建启动脚本（使用 Express 包装）
cat > "$PROJECT_DIR/server.js" << 'EOF'
/**
 * Gemini Balance Lite - Express Server Wrapper
 * 将边缘函数代码包装为独立的 Node.js 服务
 */

import express from 'express';
import { handleRequest } from './src/handle_request.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 处理所有请求
app.all('*', async (req, res) => {
  try {
    // 构建 Request 对象（模拟 Fetch API）
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }

    // 获取请求体
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body,
    });

    // 调用处理函数
    const response = await handleRequest(request);

    // 设置响应头
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    // 设置状态码
    res.status(response.status);

    // 发送响应体
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(value);
        await pump();
      };
      await pump();
    } else {
      res.end(await response.text());
    }
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gemini Balance Lite proxy running on port ${PORT}`);
  console.log(`Test: curl http://localhost:${PORT}/`);
});
EOF

# 安装 express
npm install express

# 停止旧服务（如果存在）
pm2 delete gemini-proxy 2>/dev/null || true

# 启动服务
echo "启动 Gemini 代理服务..."
pm2 start "$PROJECT_DIR/server.js" --name gemini-proxy --interpreter node

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup

echo ""
echo "=============================================="
echo "  部署完成！"
echo "=============================================="
echo ""
echo "代理服务地址: http://$(hostname -I | awk '{print $1}'):${PROXY_PORT}"
echo ""
echo "测试命令:"
echo "  curl http://localhost:${PROXY_PORT}/"
echo ""
echo "查看日志:"
echo "  pm2 logs gemini-proxy"
echo ""
echo "重启服务:"
echo "  pm2 restart gemini-proxy"
echo ""
