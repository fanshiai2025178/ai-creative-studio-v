# 🚀 AI Creative Studio V2 - 服务器部署指南

本文档详细介绍如何在阿里云 ECS 服务器上部署 AI Creative Studio V2。

---

## 📋 部署前准备

### 1. 服务器要求

- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+)
- **CPU**: 2 核心+
- **内存**: 4GB+
- **硬盘**: 40GB+
- **网络**: 公网 IP + 域名（已备案）

### 2. 已完成的配置

✅ **域名**: `fanshai.com.cn` 已解析到服务器 IP `8.145.33.52`  
✅ **Nginx**: 已安装并配置  
✅ **OSS**: 已创建 Bucket 并配置 RAM 用户

---

## 🛠️ 第一步：安装 Node.js

```bash
# 使用 NodeSource 安装 Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v  # 应显示 v20.x.x
npm -v   # 应显示 npm 版本
```

---

## 🗄️ 第二步：安装 MySQL

```bash
# 安装 MySQL 8.0
sudo yum install -y mysql-server

# 启动 MySQL
sudo systemctl start mysqld
sudo systemctl enable mysqld

# 查看临时密码
sudo grep 'temporary password' /var/log/mysqld.log

# 登录 MySQL 并修改密码
mysql -u root -p
# 输入临时密码，然后执行：
ALTER USER 'root'@'localhost' IDENTIFIED BY 'YourStrongPassword123!';
CREATE DATABASE ai_comic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

---

## 📦 第三步：安装 PM2

```bash
# 全局安装 PM2
sudo npm install -g pm2 pnpm

# 验证安装
pm2 -v
pnpm -v
```

---

## 📥 第四步：部署项目

### 1. 克隆项目

```bash
# 进入网站目录
cd /usr/share/nginx

# 克隆项目
git clone https://github.com/fanshiai2025178/ai-creative-studio-v2.git
cd ai-creative-studio-v2
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

**填写以下配置**：

```bash
# 数据库配置
DATABASE_URL="mysql://root:YourStrongPassword123!@localhost:3306/ai_comic"

# JWT 密钥（生成新的）
JWT_SECRET="你的随机密钥-请修改"

# Gemini API Key
GEMINI_API_KEY="你的 Gemini API Key"

# 阿里云 OSS 配置
OSS_ACCESS_KEY_ID="你的 OSS AccessKey ID"
OSS_ACCESS_KEY_SECRET="你的 OSS AccessKey Secret"
OSS_BUCKET="你的 Bucket 名称"
OSS_REGION="oss-cn-hangzhou"

# 服务器配置
PORT=3000
NODE_ENV=production
```

### 3. 安装依赖

```bash
# 使用 pnpm 安装依赖
pnpm install
```

### 4. 初始化数据库

```bash
# 运行数据库迁移
pnpm run db:push
```

### 5. 构建项目

```bash
# 构建前端和后端
pnpm run build
```

### 6. 启动服务

```bash
# 使用 PM2 启动
pm2 start dist/index.js --name "ai-comic-studio"

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

---

## 🌐 第五步：配置 Nginx 反向代理

编辑 Nginx 配置文件：

```bash
sudo vim /etc/nginx/conf.d/fanshai.com.cn.conf
```

**替换为以下内容**：

```nginx
server {
    listen 80;
    listen [::]:80;
    
    server_name fanshai.com.cn www.fanshai.com.cn api.fanshai.com.cn;
    
    # 反向代理到 Node.js 应用
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
    
    # 客户端最大请求体大小（支持大文件上传）
    client_max_body_size 200M;
}
```

**重启 Nginx**：

```bash
sudo nginx -t           # 测试配置
sudo systemctl reload nginx  # 重新加载配置
```

---

## 🔐 第六步：配置 SSL 证书（推荐）

```bash
# 安装 Certbot
sudo yum install -y certbot python3-certbot-nginx

# 自动配置 SSL
sudo certbot --nginx -d fanshai.com.cn -d www.fanshai.com.cn
```

---

## ✅ 第七步：验证部署

1. **检查服务状态**：
   ```bash
   pm2 status
   pm2 logs ai-comic-studio
   ```

2. **访问网站**：
   - 打开浏览器访问：`http://fanshai.com.cn`
   - 应该能看到应用首页

3. **测试功能**：
   - 测试角色生成
   - 测试图片上传
   - 测试 AI 对话

---

## 🔄 日常维护

### 查看日志

```bash
# 查看 PM2 日志
pm2 logs ai-comic-studio

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 重启服务

```bash
# 重启 Node.js 应用
pm2 restart ai-comic-studio

# 重启 Nginx
sudo systemctl restart nginx

# 重启 MySQL
sudo systemctl restart mysqld
```

### 更新代码

```bash
cd /usr/share/nginx/ai-creative-studio-v2

# 拉取最新代码
git pull origin main

# 安装新依赖
pnpm install

# 运行数据库迁移（如果有）
pnpm run db:push

# 重新构建
pnpm run build

# 重启服务
pm2 restart ai-comic-studio
```

---

## 🐛 故障排查

### 1. 服务启动失败

```bash
# 查看详细日志
pm2 logs ai-comic-studio --lines 100

# 常见问题：
# - 端口被占用：修改 .env 中的 PORT
# - 数据库连接失败：检查 DATABASE_URL
# - 环境变量缺失：检查 .env 文件
```

### 2. 网站无法访问

```bash
# 检查 Nginx 状态
sudo systemctl status nginx

# 检查端口监听
sudo netstat -tulnp | grep 3000
sudo netstat -tulnp | grep 80

# 检查防火墙
sudo firewall-cmd --list-all
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --reload
```

### 3. 图片上传失败

```bash
# 检查 OSS 配置
cat .env | grep OSS

# 测试 OSS 连接
# 在项目根目录创建测试脚本：test-oss.js
node test-oss.js
```

---

## 📚 相关链接

- **GitHub 仓库**: https://github.com/fanshiai2025178/ai-creative-studio-v2
- **Gemini API**: https://makersuite.google.com/app/apikey
- **阿里云 OSS**: https://oss.console.aliyun.com/

---

## 🎉 部署完成！

现在你的 AI Creative Studio 已经完全独立运行，不依赖任何第三方平台！

**遇到问题？** 查看日志或联系技术支持。
