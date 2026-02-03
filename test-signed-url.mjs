import 'dotenv/config';

const baseUrl = process.env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, '');
const apiKey = process.env.BUILT_IN_FORGE_API_KEY;

// 测试获取签名 URL
const testKey = 'generated/1769909779123.png';
const downloadApiUrl = new URL('v1/storage/downloadUrl', baseUrl + '/');
downloadApiUrl.searchParams.set('path', testKey);

console.log('请求签名 URL:', downloadApiUrl.toString());

const response = await fetch(downloadApiUrl, {
  method: 'GET',
  headers: { Authorization: `Bearer ${apiKey}` }
});

const data = await response.json();
console.log('签名 URL 响应:', JSON.stringify(data, null, 2));

// 测试签名 URL 是否可访问
if (data.url) {
  const testResponse = await fetch(data.url, { method: 'HEAD' });
  console.log('签名 URL 状态:', testResponse.status);
}
