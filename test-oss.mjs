// OSS 连接测试脚本
// 用于验证 OSS 配置是否正确

import "dotenv/config";
import OSS from "ali-oss";

console.log("🧪 开始测试 OSS 连接...\n");

// 读取环境变量
const {
  OSS_ACCESS_KEY_ID,
  OSS_ACCESS_KEY_SECRET,
  OSS_BUCKET,
  OSS_REGION,
} = process.env;

// 检查配置
console.log("📋 OSS 配置：");
console.log(`  AccessKey ID: ${OSS_ACCESS_KEY_ID ? "已配置 ✅" : "❌ 未配置"}`);
console.log(`  AccessKey Secret: ${OSS_ACCESS_KEY_SECRET ? "已配置 ✅" : "❌ 未配置"}`);
console.log(`  Bucket: ${OSS_BUCKET || "❌ 未配置"}`);
console.log(`  Region: ${OSS_REGION || "❌ 未配置"}`);
console.log("");

if (!OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET || !OSS_BUCKET) {
  console.error("❌ OSS 配置不完整，请检查 .env 文件");
  process.exit(1);
}

// 创建 OSS 客户端
const client = new OSS({
  accessKeyId: OSS_ACCESS_KEY_ID,
  accessKeySecret: OSS_ACCESS_KEY_SECRET,
  bucket: OSS_BUCKET,
  region: OSS_REGION || "oss-cn-hangzhou",
});

async function testOSS() {
  try {
    // 1. 列出 Bucket 中的文件
    console.log("📂 列出 Bucket 中的文件（前 10 个）...");
    const listResult = await client.list({
      "max-keys": 10,
    });
    console.log(`  找到 ${listResult.objects?.length || 0} 个文件`);
    if (listResult.objects && listResult.objects.length > 0) {
      listResult.objects.forEach((obj, index) => {
        console.log(`  ${index + 1}. ${obj.name} (${(obj.size / 1024).toFixed(2)} KB)`);
      });
    }
    console.log("");

    // 2. 上传测试文件
    console.log("📤 上传测试文件...");
    const testContent = `OSS Test File - ${new Date().toISOString()}`;
    const testKey = `test/${Date.now()}.txt`;
    const uploadResult = await client.put(testKey, Buffer.from(testContent));
    console.log(`  ✅ 上传成功: ${testKey}`);
    console.log(`  URL: ${uploadResult.url}`);
    console.log("");

    // 3. 读取测试文件
    console.log("📥 读取测试文件...");
    const getResult = await client.get(testKey);
    const content = getResult.content.toString();
    console.log(`  ✅ 读取成功`);
    console.log(`  内容: ${content}`);
    console.log("");

    // 4. 删除测试文件
    console.log("🗑️  删除测试文件...");
    await client.delete(testKey);
    console.log(`  ✅ 删除成功`);
    console.log("");

    // 5. 生成签名 URL
    console.log("🔐 生成签名 URL（如果 Bucket 是私有的）...");
    const signedUrl = client.signatureUrl(testKey, {
      expires: 3600,
    });
    console.log(`  ✅ 签名 URL 生成成功`);
    console.log(`  URL: ${signedUrl}`);
    console.log("");

    console.log("✅ OSS 连接测试成功！所有功能正常！");
  } catch (error) {
    console.error("\n❌ OSS 连接测试失败：");
    console.error(error.message);
    
    if (error.code === "InvalidAccessKeyId") {
      console.error("\n💡 可能的原因：");
      console.error("  1. AccessKey ID 不正确");
      console.error("  2. RAM 用户权限不足");
    } else if (error.code === "NoSuchBucket") {
      console.error("\n💡 可能的原因：");
      console.error("  1. Bucket 名称不正确");
      console.error("  2. Bucket 不存在");
    } else if (error.code === "AccessDenied") {
      console.error("\n💡 可能的原因：");
      console.error("  1. RAM 用户没有访问此 Bucket 的权限");
      console.error("  2. 需要在 OSS 控制台配置 Bucket 访问权限");
    }
    
    process.exit(1);
  }
}

testOSS();
