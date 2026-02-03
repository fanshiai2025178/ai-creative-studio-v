# Gemini API 代理配置问题

## 背景

大陆服务器（阿里云乌兰察布，IP: `8.145.33.52`）无法直接访问 Google Gemini API，需要通过代理。

## 已完成的配置

### 1. 美国 VPS 代理服务器

- **提供商**: 搬瓦工 (BandwagonHost)
- **位置**: 美国洛杉矶 DC2
- **IP**: `67.216.207.119`
- **代理端口**: `8080`
- **代理地址**: `http://67.216.207.119:8080`

### 2. Nginx 代理配置

美国 VPS 上的 Nginx 配置 (`/etc/nginx/conf.d/gemini-proxy.conf`):

```nginx
server {
    listen 8080;
    server_name _;
    
    location / {
        proxy_pass https://generativelanguage.googleapis.com;
        proxy_ssl_server_name on;
        proxy_set_header Host generativelanguage.googleapis.com;
        proxy_buffering off;
    }
}
```

### 3. 代理测试结果

从大陆服务器测试代理连接成功：

```bash
curl http://67.216.207.119:8080/v1beta/models
```

返回 403（因为没带 API Key），说明代理工作正常。

## 已修改的代码

### 文件 1: `server/_core/gemini.ts`

```typescript
// 添加在文件顶部
const GEMINI_PROXY_URL = "http://67.216.207.119:8080";

// 修改 getGeminiClient 函数
function getGeminiClient(userApiKey?: string): GoogleGenAI {
  const apiKey = userApiKey || ENV.geminiApiKey;
  if (!apiKey) {
    throw new Error("Gemini API Key 未配置");
  }
  
  if (clientCache.has(apiKey)) {
    return clientCache.get(apiKey)!;
  }
  
  // 使用代理
  const client = new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      baseUrl: GEMINI_PROXY_URL
    }
  });
  clientCache.set(apiKey, client);
  return client;
}
```

### 文件 2: `server/_core/llm.ts`

```typescript
// 修改 API URL
const GEMINI_PROXY_URL = "http://67.216.207.119:8080";
const GEMINI_OPENAI_API_URL = `${GEMINI_PROXY_URL}/v1beta/openai/chat/completions`;
```

## 当前问题

尽管源代码已修改，应用运行时仍然直接连接 Google（`142.250.73.138:443`），没有使用代理。

### 错误日志

```
[cause]: ConnectTimeoutError: Connect Timeout Error (attempted addresses: 142.250.73.138:443, ...)
```

## 需要解决的问题

1. **检查构建产物**: 确认 `/root/ai-creative-studio-v2/dist/index.js` 是否包含代理地址 `67.216.207.119`

2. **可能的问题**:
   - `@google/genai` SDK 可能不支持 `httpOptions.baseUrl` 配置
   - 需要查看 SDK 文档确认正确的代理配置方式

3. **备选方案**:
   - 如果 SDK 不支持自定义 baseUrl，可能需要：
     - 使用环境变量 `HTTPS_PROXY` 或 `HTTP_PROXY`
     - 或者不使用 SDK，改用直接 fetch 调用 API

## 服务器信息

### 大陆服务器（应用服务器）
- IP: `8.145.33.52`（公网）/ `172.24.120.51`（内网）
- 项目路径: `/root/ai-creative-studio-v2`
- Node.js 应用端口: `3000`
- 进程管理: PM2

### 美国代理服务器
- IP: `67.216.207.119`
- SSH 端口: `22`
- 代理端口: `8080`
- 操作系统: Rocky Linux 9

## 测试命令

```bash
# 在大陆服务器上测试代理
curl http://67.216.207.119:8080/v1beta/models

# 检查构建产物是否包含代理配置
grep "67.216.207.119" /root/ai-creative-studio-v2/dist/index.js

# 查看应用日志
pm2 logs --lines 100

# 重新构建并重启
cd /root/ai-creative-studio-v2
pnpm run build
pm2 restart all
```
