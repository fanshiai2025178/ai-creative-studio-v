// 本地文件存储
// 图片保存到服务器本地，返回完整 URL

import fs from "fs";
import path from "path";
import { ENV } from "./_core/env";

// 上传目录配置
const UPLOAD_BASE_DIR = path.resolve(process.cwd(), "uploads");
const GENERATED_DIR = path.join(UPLOAD_BASE_DIR, "generated"); // AI 生成的图片
const ASSETS_DIR = path.join(UPLOAD_BASE_DIR, "assets"); // 用户上传的图片

// 确保目录存在
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 初始化目录
ensureDir(GENERATED_DIR);
ensureDir(ASSETS_DIR);

// 规范化文件路径（去除开头的斜杠）
function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// 生成文件访问 URL
function buildFileUrl(relPath: string): string {
  const baseUrl = ENV.baseUrl || "http://localhost:3000";
  // 确保路径以 /uploads/ 开头
  const urlPath = relPath.startsWith("uploads/") ? relPath : `uploads/${relPath}`;
  return `${baseUrl}/${urlPath}`;
}

// 根据路径判断存储目录
function getStorageDir(relKey: string): string {
  if (relKey.includes("generated") || relKey.startsWith("generated/")) {
    return GENERATED_DIR;
  }
  if (relKey.includes("assets") || relKey.startsWith("assets/")) {
    return ASSETS_DIR;
  }
  // 默认保存到 assets
  return ASSETS_DIR;
}

// 从 relKey 中提取文件名
function extractFileName(relKey: string): string {
  const parts = relKey.split("/");
  return parts[parts.length - 1];
}

/**
 * 上传文件到本地存储
 * @param relKey 文件相对路径（如：assets/character/123.png 或 generated/image.png）
 * @param data 文件数据（Buffer、Uint8Array 或 string）
 * @param contentType 文件 MIME 类型（用于确定扩展名）
 * @returns { key: 文件路径, url: 访问地址 }
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  
  // 确定存储目录
  const storageDir = getStorageDir(key);
  
  // 提取或生成文件名
  let fileName = extractFileName(key);
  
  // 如果文件名没有扩展名，根据 contentType 添加
  if (!path.extname(fileName)) {
    const ext = contentType.includes("png") ? ".png" 
              : contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg"
              : contentType.includes("gif") ? ".gif"
              : contentType.includes("webp") ? ".webp"
              : ".png";
    fileName += ext;
  }
  
  // 构建完整文件路径
  const filePath = path.join(storageDir, fileName);
  
  // 确保目录存在
  ensureDir(path.dirname(filePath));
  
  // 转换数据为 Buffer
  const buffer = typeof data === "string" 
    ? Buffer.from(data, "base64") 
    : Buffer.from(data);
  
  // 写入文件
  fs.writeFileSync(filePath, buffer);
  
  // 构建相对路径用于 URL
  const relativePath = path.relative(UPLOAD_BASE_DIR, filePath).replace(/\\/g, "/");
  const urlPath = `uploads/${relativePath}`;
  const url = buildFileUrl(relativePath);
  
  console.log(`[Storage] Saved file: ${filePath} -> ${url}`);
  
  return {
    key: urlPath,
    url,
  };
}

/**
 * 获取文件的访问 URL
 * @param relKey 文件相对路径
 * @returns { key: 文件路径, url: 访问地址 }
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  
  // 尝试在不同目录查找文件
  let filePath: string | null = null;
  
  // 如果 key 包含完整路径
  if (key.startsWith("uploads/")) {
    const fullPath = path.join(process.cwd(), key);
    if (fs.existsSync(fullPath)) {
      filePath = fullPath;
    }
  }
  
  // 在 generated 目录查找
  if (!filePath) {
    const generatedPath = path.join(GENERATED_DIR, extractFileName(key));
    if (fs.existsSync(generatedPath)) {
      filePath = generatedPath;
    }
  }
  
  // 在 assets 目录查找
  if (!filePath) {
    const assetsPath = path.join(ASSETS_DIR, extractFileName(key));
    if (fs.existsSync(assetsPath)) {
      filePath = assetsPath;
    }
  }
  
  if (!filePath) {
    throw new Error(`File not found: ${key}`);
  }
  
  const relativePath = path.relative(UPLOAD_BASE_DIR, filePath).replace(/\\/g, "/");
  const url = buildFileUrl(relativePath);
  
  console.log(`[Storage] Retrieved file URL: ${key} -> ${url}`);
  
  return {
    key: `uploads/${relativePath}`,
    url,
  };
}

/**
 * 生成签名 URL（本地存储直接返回普通 URL）
 * @param relKey 文件相对路径
 * @param expiresInSeconds 过期时间（本地存储忽略此参数）
 * @returns 访问 URL
 */
export async function storageGetSignedUrl(
  relKey: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const result = await storageGet(relKey);
  console.log(`[Storage] Generated URL: ${relKey}`);
  return result.url;
}

/**
 * 删除文件
 * @param relKey 文件相对路径
 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  
  // 尝试删除文件
  const possiblePaths = [
    path.join(process.cwd(), key),
    path.join(GENERATED_DIR, extractFileName(key)),
    path.join(ASSETS_DIR, extractFileName(key)),
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Storage] Deleted file: ${filePath}`);
      return;
    }
  }
  
  console.log(`[Storage] File not found for deletion: ${key}`);
}

/**
 * 批量删除文件
 * @param relKeys 文件相对路径数组
 */
export async function storageDeleteBatch(relKeys: string[]): Promise<void> {
  for (const key of relKeys) {
    await storageDelete(key);
  }
  console.log(`[Storage] Deleted ${relKeys.length} files`);
}
