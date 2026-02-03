/**
 * 为预设风格生成示例缩略图
 * 使用图片生成 API 为每个风格生成一张角色示例图
 */

import 'dotenv/config';

// 预设风格列表
const PRESET_STYLES = [
  {
    id: "cel-shaded",
    name: "日系赛璐璐风格",
    prompt: "cel-shaded anime style, sharp clean lines, bold outlines, flat colors, minimal gradients, a young female warrior with sword, anime character design",
  },
  {
    id: "light-novel",
    name: "轻小说插画风格",
    prompt: "light novel illustration style, detailed anime art, soft lighting, vibrant colors, a beautiful anime girl in school uniform, character portrait",
  },
  {
    id: "shinkai",
    name: "新海诚电影风格",
    prompt: "Makoto Shinkai style, beautiful sky, dramatic lighting, cinematic atmosphere, a young person looking at the sky, lens flare, detailed clouds",
  },
  {
    id: "ghibli",
    name: "吉卜力风格",
    prompt: "Studio Ghibli style, warm natural colors, hand-drawn details, whimsical atmosphere, a gentle girl in nature, Hayao Miyazaki style",
  },
  {
    id: "magical-girl",
    name: "魔法少女风格",
    prompt: "magical girl anime style, dreamy colors, sparkling effects, elegant costume, a magical girl with wand, heroic pose, pink and purple theme",
  },
  {
    id: "chibi",
    name: "Q版萌系风格",
    prompt: "chibi style, kawaii, 2-head proportion, big eyes, cute expression, a cute chibi character, simple background, adorable design",
  },
  {
    id: "chinese-ink",
    name: "上美水墨动画风",
    prompt: "Chinese ink-wash animation style, traditional brush painting, poetic atmosphere, a martial artist in flowing robes, ink wash effect",
  },
  {
    id: "chinese-3d",
    name: "3D国漫风格",
    prompt: "Chinese 3D animation style, martial arts, fantasy elements, dynamic ink effects, a heroic warrior, donghua style, epic pose",
  },
  {
    id: "chinese-classical",
    name: "国风古典风格",
    prompt: "classical Chinese style, traditional hanfu costume, ancient architecture, ink landscape, an elegant lady in hanfu, elegant atmosphere",
  },
  {
    id: "pixar-disney",
    name: "皮克斯/迪士尼3D风格",
    prompt: "Pixar animation style, 3D rendered, expressive characters, warm lighting, a friendly cartoon character, Disney style, cute design",
  },
  {
    id: "american-comic",
    name: "美式漫画风格",
    prompt: "American comic book style, bold lines, high contrast, dynamic pose, a superhero character, Marvel DC style, powerful stance",
  },
  {
    id: "cartoon-simple",
    name: "卡通简约风格",
    prompt: "cartoon style, simple lines, bright colors, exaggerated proportions, a playful character, Adventure Time style, fun design",
  },
  {
    id: "cyberpunk",
    name: "赛博朋克风格",
    prompt: "cyberpunk anime style, neon lights, futuristic city, cybernetic implants, a cyber warrior, dark atmosphere, glowing effects",
  },
  {
    id: "painterly-fantasy",
    name: "厚涂幻想风格",
    prompt: "painterly fantasy style, rich brushstrokes, dramatic lighting, epic atmosphere, a fantasy warrior, digital painting, concept art",
  },
  {
    id: "semi-realistic",
    name: "半写实动漫风格",
    prompt: "semi-realistic anime style, detailed skin texture, realistic lighting, anime features, a beautiful character portrait, 2.5D style",
  },
  {
    id: "pixel-art",
    name: "复古像素风格",
    prompt: "pixel art style, 8-bit, retro gaming, nostalgic colors, a pixel character sprite, game character design, pixelated",
  },
];

// 图片生成 API 配置
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

async function generateImage(prompt) {
  const response = await fetch(`${FORGE_API_URL}/image/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: prompt,
      size: '1024x1024', // 正方形缩略图
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`图片生成失败: ${error}`);
  }

  const data = await response.json();
  return data.url;
}

async function uploadToS3(imageUrl, filename) {
  // 下载图片
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  
  // 上传到 S3
  const response = await fetch(`${FORGE_API_URL}/storage/put`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify({
      key: `style-thumbnails/${filename}`,
      data: Buffer.from(imageBuffer).toString('base64'),
      contentType: 'image/png',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`上传失败: ${error}`);
  }

  const data = await response.json();
  return data.url;
}

async function main() {
  console.log('开始生成风格示例图片...\n');
  
  const results = [];
  
  for (const style of PRESET_STYLES) {
    console.log(`正在生成: ${style.name} (${style.id})`);
    
    try {
      // 生成图片
      const imageUrl = await generateImage(style.prompt);
      console.log(`  生成成功: ${imageUrl}`);
      
      // 上传到 S3
      const s3Url = await uploadToS3(imageUrl, `${style.id}.png`);
      console.log(`  上传成功: ${s3Url}`);
      
      results.push({
        id: style.id,
        name: style.name,
        thumbnailUrl: s3Url,
      });
    } catch (error) {
      console.error(`  失败: ${error.message}`);
      results.push({
        id: style.id,
        name: style.name,
        thumbnailUrl: null,
        error: error.message,
      });
    }
    
    console.log('');
  }
  
  // 输出结果
  console.log('\n=== 生成结果 ===\n');
  console.log(JSON.stringify(results, null, 2));
  
  // 生成代码片段
  console.log('\n=== 更新代码 ===\n');
  console.log('const STYLE_THUMBNAILS = {');
  for (const result of results) {
    if (result.thumbnailUrl) {
      console.log(`  "${result.id}": "${result.thumbnailUrl}",`);
    }
  }
  console.log('};');
}

main().catch(console.error);
