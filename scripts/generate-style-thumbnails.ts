/**
 * 为预设风格生成示例缩略图
 * 使用项目内置的图片生成 API
 */

import { generateImage } from "../server/_core/imageGeneration";
import { storagePut } from "../server/storage";

// 预设风格列表 - 每个风格的示例 prompt
const PRESET_STYLES = [
  {
    id: "cel-shaded",
    name: "日系赛璐璐风格",
    prompt: "cel-shaded anime style, sharp clean lines, bold outlines, flat colors, minimal gradients, a young female warrior with sword, anime character design, white background",
  },
  {
    id: "light-novel",
    name: "轻小说插画风格",
    prompt: "light novel illustration style, detailed anime art, soft lighting, vibrant colors, a beautiful anime girl in elegant dress, character portrait, white background",
  },
  {
    id: "shinkai",
    name: "新海诚电影风格",
    prompt: "Makoto Shinkai style, beautiful sky, dramatic lighting, cinematic atmosphere, a young person looking at the sky, lens flare, detailed clouds, character portrait",
  },
  {
    id: "ghibli",
    name: "吉卜力风格",
    prompt: "Studio Ghibli style, warm natural colors, hand-drawn details, whimsical atmosphere, a gentle girl in nature, Hayao Miyazaki style, character portrait",
  },
  {
    id: "magical-girl",
    name: "魔法少女风格",
    prompt: "magical girl anime style, dreamy colors, sparkling effects, elegant costume, a magical girl with wand, heroic pose, pink and purple theme, character portrait",
  },
  {
    id: "chibi",
    name: "Q版萌系风格",
    prompt: "chibi style, kawaii, 2-head proportion, big eyes, cute expression, a cute chibi character, simple background, adorable design, character portrait",
  },
  {
    id: "chinese-ink",
    name: "上美水墨动画风",
    prompt: "Chinese ink-wash animation style, traditional brush painting, poetic atmosphere, a martial artist in flowing robes, ink wash effect, character portrait",
  },
  {
    id: "chinese-3d",
    name: "3D国漫风格",
    prompt: "Chinese 3D animation style, martial arts, fantasy elements, dynamic ink effects, a heroic warrior, donghua style, epic pose, character portrait",
  },
  {
    id: "chinese-classical",
    name: "国风古典风格",
    prompt: "classical Chinese style, traditional hanfu costume, ancient architecture, ink landscape, an elegant lady in hanfu, elegant atmosphere, character portrait",
  },
  {
    id: "pixar-disney",
    name: "皮克斯/迪士尼3D风格",
    prompt: "Pixar animation style, 3D rendered, expressive characters, warm lighting, a friendly cartoon character, Disney style, cute design, character portrait",
  },
  {
    id: "american-comic",
    name: "美式漫画风格",
    prompt: "American comic book style, bold lines, high contrast, dynamic pose, a superhero character, Marvel DC style, powerful stance, character portrait",
  },
  {
    id: "cartoon-simple",
    name: "卡通简约风格",
    prompt: "cartoon style, simple lines, bright colors, exaggerated proportions, a playful character, Adventure Time style, fun design, character portrait",
  },
  {
    id: "cyberpunk",
    name: "赛博朋克风格",
    prompt: "cyberpunk anime style, neon lights, futuristic city, cybernetic implants, a cyber warrior, dark atmosphere, glowing effects, character portrait",
  },
  {
    id: "painterly-fantasy",
    name: "厚涂幻想风格",
    prompt: "painterly fantasy style, rich brushstrokes, dramatic lighting, epic atmosphere, a fantasy warrior, digital painting, concept art, character portrait",
  },
  {
    id: "semi-realistic",
    name: "半写实动漫风格",
    prompt: "semi-realistic anime style, detailed skin texture, realistic lighting, anime features, a beautiful character portrait, 2.5D style",
  },
  {
    id: "pixel-art",
    name: "复古像素风格",
    prompt: "pixel art style, 8-bit, retro gaming, nostalgic colors, a pixel character sprite, game character design, pixelated, character portrait",
  },
];

async function generateStyleThumbnail(style: typeof PRESET_STYLES[0]) {
  console.log(`\n正在生成: ${style.name} (${style.id})`);
  
  try {
    // 生成图片
    const result = await generateImage({
      prompt: style.prompt,
      aspectRatio: "1:1", // 正方形缩略图
      imageSize: "1K", // 1024x1024
    });
    
    if (result.url) {
      console.log(`  ✓ 生成成功: ${result.url}`);
      return {
        id: style.id,
        name: style.name,
        thumbnailUrl: result.url,
      };
    } else {
      console.error(`  ✗ 生成失败: 没有返回 URL`);
      return {
        id: style.id,
        name: style.name,
        thumbnailUrl: null,
        error: "没有返回 URL",
      };
    }
  } catch (error) {
    console.error(`  ✗ 生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    return {
      id: style.id,
      name: style.name,
      thumbnailUrl: null,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

async function main() {
  console.log('=== 开始生成风格示例图片 ===\n');
  console.log(`共 ${PRESET_STYLES.length} 个风格需要生成`);
  
  const results = [];
  
  for (const style of PRESET_STYLES) {
    const result = await generateStyleThumbnail(style);
    results.push(result);
    
    // 添加延迟避免 API 限流
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 输出结果
  console.log('\n\n=== 生成结果汇总 ===\n');
  
  const successCount = results.filter(r => r.thumbnailUrl).length;
  console.log(`成功: ${successCount}/${results.length}`);
  
  console.log('\n=== 成功生成的图片 URL ===\n');
  for (const result of results) {
    if (result.thumbnailUrl) {
      console.log(`${result.id}: ${result.thumbnailUrl}`);
    }
  }
  
  console.log('\n=== 更新代码片段 ===\n');
  console.log('const STYLE_THUMBNAILS: Record<string, string> = {');
  for (const result of results) {
    if (result.thumbnailUrl) {
      console.log(`  "${result.id}": "${result.thumbnailUrl}",`);
    }
  }
  console.log('};');
}

main().catch(console.error);
