const express = require("express");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3001;

// 解析请求体
app.use(express.raw({ type: "*/*", limit: "50mb" }));

// 路径映射：将简化路径映射到 Google Gemini API 的完整路径
const pathMapping = {
  "/chat/completions": "/v1beta/openai/chat/completions",
  "/v1/chat/completions": "/v1beta/openai/chat/completions",
};

// 使用中间件处理所有请求（兼容 Express 5.x）
app.use((req, res) => {
  // 获取原始路径并进行映射
  let targetPath = req.originalUrl;
  
  // 检查是否需要路径映射
  const pathWithoutQuery = targetPath.split("?")[0];
  if (pathMapping[pathWithoutQuery]) {
    const query = targetPath.includes("?") ? targetPath.substring(targetPath.indexOf("?")) : "";
    targetPath = pathMapping[pathWithoutQuery] + query;
    console.log(`[Proxy] Path mapped: ${req.originalUrl} -> ${targetPath}`);
  }
  
  console.log(`[Proxy] ${req.method} ${targetPath}`);

  const options = {
    hostname: "generativelanguage.googleapis.com",
    port: 443,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: "generativelanguage.googleapis.com" }
  };
  
  // 删除可能导致问题的头
  delete options.headers["content-length"];
  delete options.headers["connection"];
  delete options.headers["accept-encoding"];
  
  if (req.body && req.body.length > 0) {
    options.headers["content-length"] = req.body.length;
  }

  const proxyReq = https.request(options, (proxyRes) => {
    console.log(`[Proxy] Response: ${proxyRes.statusCode}`);
    res.status(proxyRes.statusCode);
    
    // 复制响应头
    Object.keys(proxyRes.headers).forEach(k => {
      if (k.toLowerCase() !== "transfer-encoding") {
        res.setHeader(k, proxyRes.headers[k]);
      }
    });
    
    // 流式传输响应
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (e) => {
    console.error(`[Proxy] Error: ${e.message}`);
    res.status(500).send("Proxy Error: " + e.message);
  });

  if (req.body && req.body.length > 0) {
    proxyReq.write(req.body);
  }
  
  proxyReq.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gemini Proxy running on port ${PORT}`);
  console.log("Path mappings:");
  Object.entries(pathMapping).forEach(([from, to]) => {
    console.log(`  ${from} -> ${to}`);
  });
});
