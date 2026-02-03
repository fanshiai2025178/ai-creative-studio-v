/**
 * 风格示例图片生成脚本
 * 使用项目内置的图片生成和存储功能
 */

import { generateImage } from "../server/_core/imageGeneration";
import { storagePut } from "../server/storage";

// 风格数据
const STYLES = [
  {
    id: "cel-shaded",
    name: "日系赛璐璐风格",
    prompt: "cel-shaded anime character portrait, sharp clean lines, bold outlines, flat colors, minimal gradients, anime style, single character, upper body, looking at viewer",
  },
  {
    id: "light-novel",
    name: "轻小说插画风格",
    prompt: "light novel illustration style character portrait, detailed anime art, soft lighting, vibrant colors, single character, upper body, elegant pose",
  },
  {
    id: "shinkai",
    name: "新海诚电影风格",
    prompt: "Makoto Shinkai style character portrait, beautiful sky background, dramatic lighting, cinematic atmosphere, detailed clouds, lens flare, single character",
  },
  {
    id: "ghibli",
    name: "吉卜力风格",
    prompt: "Studio Ghibli style character portrait, warm natural colors, hand-drawn details, whimsical atmosphere, Hayao Miyazaki style, single character",
  },
  {
    id: "magical-girl",
    name: "魔法少女风格",
    prompt: "magical girl anime character portrait, dreamy colors, sparkling effects, elegant costume, heroic pose, single character, upper body",
  },
  {
    id: "chibi",
    name: "Q版萌系风格",
    prompt: "chibi style character, kawaii, 2-head proportion, big eyes, cute expression, simple background, single character, full body",
  },
  {
    id: "chinese-ink",
    name: "上美水墨动画风",
    prompt: "Chinese ink-wash animation style character, traditional brush painting, poetic atmosphere, Shanghai Animation style, single character",
  },
  {
    id: "chinese-3d",
    name: "3D国漫风格",
    prompt: "Chinese 3D animation style character, martial arts, fantasy elements, dynamic ink effects, donghua style, single character portrait",
  },
  {
    id: "chinese-classical",
    name: "国风古典风格",
    prompt: "classical Chinese style character portrait, traditional hanfu costume, ancient architecture background, ink landscape, elegant atmosphere",
  },
  {
    id: "pixar-disney",
    name: "皮克斯/迪士尼3D风格",
    prompt: "Pixar animation style 3D character portrait, expressive character, warm lighting, Disney style, single character, upper body",
  },
  {
    id: "american-comic",
    name: "美式漫画风格",
    prompt: "American comic book style character portrait, bold lines, high contrast, dynamic pose, superhero style, single character",
  },
  {
    id: "cartoon-simple",
    name: "卡通简约风格",
    prompt: "cartoon style character, simple lines, bright colors, exaggerated proportions, playful design, single character, full body",
  },
  {
    id: "cyberpunk",
    name: "赛博朋克风格",
    prompt: "cyberpunk anime style character portrait, neon lights, futuristic city background, cybernetic implants, dark atmosphere, single character",
  },
  {
    id: "painterly-fantasy",
    name: "厚涂幻想风格",
    prompt: "painterly fantasy style character portrait, rich brushstrokes, dramatic lighting, epic atmosphere, digital painting, single character",
  },
  {
    id: "semi-realistic",
    name: "半写实动漫风格",
    prompt: "semi-realistic anime style character portrait, detailed skin texture, realistic lighting, anime features, 2.5D style, single character",
  },
  {
    id: "pixel-art",
    name: "复古像素风格",
    prompt: "pixel art style character, 8-bit, retro gaming, nostalgic colors, pixelated character, single character, full body",
  },
];

async function main() {
  console.log("开始生成风格示例图片...\n");
  
  const results: Record<string, string> = {};
  
  for (const style of STYLES) {
    console.log(`正在生成: ${style.name} (${style.id})...`);
    
    try {
      // 生成图片
      const { url: imageUrl } = await generateImage({
        prompt: style.prompt,
      });
      
      console.log(`  图片生成成功: ${imageUrl}`);
      
      // 下载图片并上传到 S3
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // 上传到 S3
      const fileKey = `style-thumbnails/${style.id}-${Date.now()}.png`;
      const { url: s3Url } = await storagePut(fileKey, buffer, "image/png");
      
      console.log(`  上传成功: ${s3Url}`);
      results[style.id] = s3Url;
      
    } catch (error) {
      console.error(`  生成失败: ${error}`);
      results[style.id] = "";
    }
    
    // 等待一下避免请求过快
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log("\n\n=== 生成完成 ===");
  console.log("请将以下代码复制到 assistantCharacterDesignRouter.ts 中:\n");
  console.log("const STYLE_THUMBNAILS: Record<string, string> = {");
  for (const [id, url] of Object.entries(results)) {
    console.log(`  "${id}": "${url}",`);
  }
  console.log("};");
}

main().catch(console.error);
