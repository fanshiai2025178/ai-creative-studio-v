/**
 * 重新生成风格示例图片并上传到 S3
 * 运行方式: cd /home/ubuntu/ai-creative-studio-v2 && npx tsx scripts/regenerate-style-thumbnails.ts
 */

import { generateImage } from "../server/_core/imageGeneration";

// 风格定义
const STYLES = [
  {
    id: "cel-shaded",
    name: "日系赛璐璐风格",
    prompt: "cel-shaded anime style illustration, a young girl with short black hair in school uniform, sharp clean lines, bold outlines, flat colors, minimal gradients, vibrant anime aesthetic, portrait shot, simple background",
  },
  {
    id: "light-novel",
    name: "轻小说插画风格",
    prompt: "light novel illustration style, a beautiful anime girl with long flowing hair, detailed anime art, soft lighting, vibrant colors, character portrait, elegant pose, dreamy atmosphere",
  },
  {
    id: "shinkai",
    name: "新海诚电影风格",
    prompt: "Makoto Shinkai style illustration, a young person looking at beautiful sky with dramatic clouds, cinematic atmosphere, lens flare, golden hour lighting, detailed clouds, emotional scene",
  },
  {
    id: "ghibli",
    name: "吉卜力风格",
    prompt: "Studio Ghibli style illustration, a cheerful young girl in a meadow with flowers, warm natural colors, hand-drawn details, whimsical atmosphere, Hayao Miyazaki style, soft and gentle",
  },
  {
    id: "magical-girl",
    name: "魔法少女风格",
    prompt: "magical girl anime style, a cute girl in elegant magical costume with sparkling effects, dreamy colors, heroic pose, transformation scene, pink and purple theme, stars and sparkles",
  },
  {
    id: "chibi",
    name: "Q版萌系风格",
    prompt: "chibi kawaii style illustration, a super cute chibi character with 2-head proportion, big sparkling eyes, adorable expression, simple pastel background, extremely cute",
  },
  {
    id: "chinese-ink",
    name: "上美水墨动画风",
    prompt: "Chinese ink wash animation style, a graceful figure in traditional hanfu, ink painting aesthetic, elegant brushstrokes, misty mountains background, traditional Chinese art style",
  },
  {
    id: "chinese-3d",
    name: "国漫3D风格",
    prompt: "Chinese 3D animation style like Nezha or White Snake, a heroic character with detailed costume, dynamic pose, cinematic lighting, high quality 3D render, epic atmosphere",
  },
  {
    id: "chinese-classical",
    name: "古风仙侠风格",
    prompt: "Chinese xianxia fantasy style, an immortal cultivator in flowing robes, mystical atmosphere, floating clouds, ancient Chinese aesthetic, elegant and ethereal",
  },
  {
    id: "pixar-disney",
    name: "皮克斯/迪士尼3D风格",
    prompt: "Pixar Disney 3D animation style, a friendly cartoon character with big expressive eyes, warm lighting, smooth 3D render, family friendly, cheerful expression",
  },
  {
    id: "american-comic",
    name: "美漫超英风格",
    prompt: "American superhero comic style, a powerful hero in dynamic action pose, bold colors, dramatic lighting, comic book aesthetic, heroic and powerful",
  },
  {
    id: "cartoon-simple",
    name: "简约卡通风格",
    prompt: "simple cartoon style illustration, a friendly character with clean lines, flat colors, minimalist design, cute and approachable, vector art style",
  },
  {
    id: "cyberpunk",
    name: "赛博朋克风格",
    prompt: "cyberpunk anime style, a cool character with neon lights and futuristic elements, dark atmosphere with vibrant neon colors, high tech low life aesthetic, rain and reflections",
  },
  {
    id: "painterly-fantasy",
    name: "油画幻想风格",
    prompt: "painterly fantasy illustration, an elegant figure in magical setting, oil painting texture, rich colors, dramatic lighting, fantasy art style, detailed and atmospheric",
  },
  {
    id: "semi-realistic",
    name: "半写实风格",
    prompt: "semi-realistic anime style portrait, a beautiful character with detailed features, realistic lighting and shading, anime eyes, high quality digital art, professional illustration",
  },
  {
    id: "pixel-art",
    name: "像素艺术风格",
    prompt: "pixel art style character, a cute retro game character, 16-bit aesthetic, limited color palette, nostalgic gaming style, clean pixel work",
  },
];

async function generateStyleThumbnails() {
  console.log("开始生成风格示例图片...\n");
  
  const results: Record<string, string> = {};
  
  for (const style of STYLES) {
    console.log(`正在生成: ${style.name} (${style.id})`);
    
    try {
      const result = await generateImage({
        prompt: style.prompt,
        aspectRatio: "1:1",
      });
      
      if (result.url) {
        results[style.id] = result.url;
        console.log(`  ✓ 成功: ${result.url}\n`);
      } else {
        console.log(`  ✗ 失败: 没有返回 URL\n`);
      }
    } catch (error) {
      console.error(`  ✗ 错误: ${error}\n`);
    }
    
    // 等待一小段时间，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log("\n\n=== 生成完成 ===\n");
  console.log("请将以下内容复制到 assistantCharacterDesignRouter.ts 中的 STYLE_THUMBNAILS:\n");
  console.log("const STYLE_THUMBNAILS: Record<string, string> = {");
  for (const [id, url] of Object.entries(results)) {
    console.log(`  "${id}": "${url}",`);
  }
  console.log("};");
}

generateStyleThumbnails().catch(console.error);
