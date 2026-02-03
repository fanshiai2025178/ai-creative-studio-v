// 阿里云 OSS 存储集成
// 完全独立部署，不依赖 Manus

import OSS from "ali-oss";
import { ENV } from "./_core/env";

// 创建 OSS 客户端实例
function createOSSClient() {
  const { ossAccessKeyId, ossAccessKeySecret, ossBucket, ossRegion } = ENV;

  if (!ossAccessKeyId || !ossAccessKeySecret || !ossBucket) {
    throw new Error(
      "OSS credentials missing: set OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, and OSS_BUCKET in .env"
    );
  }

  return new OSS({
    accessKeyId: ossAccessKeyId,
    accessKeySecret: ossAccessKeySecret,
    bucket: ossBucket,
    region: ossRegion,
  });
}

// 规范化文件路径（去除开头的斜杠）
function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// 生成文件访问 URL
function buildFileUrl(client: OSS, key: string): string {
  const { ossCustomDomain, ossBucket, ossRegion } = ENV;

  // 如果配置了自定义域名，使用自定义域名
  if (ossCustomDomain) {
    return `${ossCustomDomain}/${key}`;
  }

  // 否则使用 OSS 默认域名
  return `https://${ossBucket}.${ossRegion}.aliyuncs.com/${key}`;
}

/**
 * 上传文件到 OSS
 * @param relKey 文件相对路径（如：images/character/123.png）
 * @param data 文件数据（Buffer、Uint8Array 或 string）
 * @param contentType 文件 MIME 类型
 * @returns { key: 文件路径, url: 访问地址 }
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = createOSSClient();
  const key = normalizeKey(relKey);

  // 转换数据为 Buffer
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  // 上传到 OSS
  const result = await client.put(key, buffer, {
    headers: {
      "Content-Type": contentType,
    },
  });

  const url = buildFileUrl(client, key);

  console.log(`[OSS] Uploaded file: ${key} -> ${url}`);

  return {
    key,
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
  const client = createOSSClient();
  const key = normalizeKey(relKey);

  // 检查文件是否存在
  try {
    await client.head(key);
  } catch (error: any) {
    if (error.code === "NoSuchKey") {
      throw new Error(`File not found: ${key}`);
    }
    throw error;
  }

  const url = buildFileUrl(client, key);

  console.log(`[OSS] Retrieved file URL: ${key} -> ${url}`);

  return {
    key,
    url,
  };
}

/**
 * 生成签名 URL（用于私有文件访问）
 * @param relKey 文件相对路径
 * @param expiresInSeconds 过期时间（秒），默认 1 小时
 * @returns 签名后的临时访问 URL
 */
export async function storageGetSignedUrl(
  relKey: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const client = createOSSClient();
  const key = normalizeKey(relKey);

  // 生成签名 URL
  const url = client.signatureUrl(key, {
    expires: expiresInSeconds,
  });

  console.log(`[OSS] Generated signed URL: ${key} (expires in ${expiresInSeconds}s)`);

  return url;
}

/**
 * 删除文件
 * @param relKey 文件相对路径
 */
export async function storageDelete(relKey: string): Promise<void> {
  const client = createOSSClient();
  const key = normalizeKey(relKey);

  await client.delete(key);

  console.log(`[OSS] Deleted file: ${key}`);
}

/**
 * 批量删除文件
 * @param relKeys 文件相对路径数组
 */
export async function storageDeleteBatch(relKeys: string[]): Promise<void> {
  const client = createOSSClient();
  const keys = relKeys.map(normalizeKey);

  await client.deleteMulti(keys);

  console.log(`[OSS] Deleted ${keys.length} files`);
}
