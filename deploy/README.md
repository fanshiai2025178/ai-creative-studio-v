# AI 创意工作室 - Hostinger VPS 部署指南

## 服务器信息

- **VPS 提供商**: Hostinger
- **方案**: KVM 4 (4核 16GB 内存)
- **操作系统**: Ubuntu 24.04 LTS
- **服务器位置**: United States - Boston
- **IP 地址**: 72.61.74.232

## 架构说明

此版本部署在**国外服务器**，可以直接访问 Google Gemini API，无需代理。

```
用户 → Hostinger VPS (美国) → Google Gemini API
         ↓
    整个应用都在这里：
    - 前端 (Nuxt.js)
    - 后端 (Node.js)
    - 数据库 (MySQL)
    - AI 功能 (直接调用 Gemini)
```

## 快速部署

### 1. SSH 登录服务器

```bash
ssh root@72.61.74.232
```

### 2. 下载并运行部署脚本

```bash
# 下载脚本
curl -O https://raw.githubusercontent.com/fanshiai2025178/ai-creative-studio-v2/main/deploy/setup-server.sh

# 添加执行权限
chmod +x setup-server.sh

# 运行部署脚本
./setup-server.sh
```

### 3. 配置环境变量

```bash
nano /var/www/ai-creative-studio/.env
```

填入以下配置：

```env
# 数据库配置
DATABASE_URL="mysql://root:你的MySQL密码@localhost:3306/ai_comic"

# JWT 密钥（请修改为随机字符串）
JWT_SECRET="your-random-secret-key"

# 应用配置
PORT=3000
NODE_ENV=production
VITE_APP_ID=ai-creative-studio

# 阿里云 OSS 配置（如果继续使用）
OSS_ACCESS_KEY_ID="你的OSS AccessKey ID"
OSS_ACCESS_KEY_SECRET="你的OSS AccessKey Secret"
OSS_BUCKET="你的OSS Bucket"
OSS_REGION="oss-cn-hangzhou"
```

### 4. 重启应用

```bash
cd /var/www/ai-creative-studio
pm2 restart all
```

## 域名配置

### 1. 购买国外域名

推荐平台：
- Namecheap
- Cloudflare
- GoDaddy

### 2. DNS 解析

将域名 A 记录指向服务器 IP：`72.61.74.232`

### 3. 修改 Nginx 配置

```bash
nano /etc/nginx/sites-available/ai-creative-studio
```

将 `server_name _;` 改为你的域名：

```nginx
server_name your-domain.com;
```

### 4. 重载 Nginx

```bash
systemctl reload nginx
```

### 5. 配置 SSL 证书

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## 日常维护

### 查看应用状态

```bash
pm2 list
pm2 logs ai-creative-studio
```

### 更新代码

```bash
cd /var/www/ai-creative-studio
./deploy/update-app.sh
```

### 重启应用

```bash
pm2 restart all
```

### 查看日志

```bash
# 应用日志
pm2 logs

# Nginx 日志
tail -f /var/log/nginx/ai-creative-access.log
tail -f /var/log/nginx/ai-creative-error.log
```

## 与旧架构的区别

| 对比项 | 旧架构（国内服务器） | 新架构（国外服务器） |
|--------|---------------------|---------------------|
| 主服务器 | 阿里云 ECS（乌兰察布） | Hostinger VPS（美国） |
| 代理服务器 | 搬瓦工 VPS（美国） | 不需要 |
| Gemini API 调用 | 通过代理转发 | 直接调用 |
| 访问方式 | 国内直接访问 | 需要 VPN |
| 域名 | 已备案的 .com.cn | 国外域名（无需备案） |

## 注意事项

1. **用户访问**：国内用户需要开启 VPN 才能访问
2. **API Key**：用户仍需在注册时提供自己的 Gemini API Key
3. **数据迁移**：如需迁移旧数据，请导出旧数据库并导入新服务器
4. **OSS 存储**：可以继续使用阿里云 OSS，或迁移到其他存储服务

## 故障排查

### 应用无法启动

```bash
# 查看详细日志
pm2 logs ai-creative-studio --lines 100

# 检查端口占用
netstat -tlnp | grep 3000
```

### 数据库连接失败

```bash
# 检查 MySQL 状态
systemctl status mysql

# 测试连接
mysql -u root -p
```

### Nginx 502 错误

```bash
# 检查应用是否运行
pm2 list

# 检查 Nginx 配置
nginx -t
```
