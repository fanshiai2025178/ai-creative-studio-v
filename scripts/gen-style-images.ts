/**
 * 生成风格示例图片，直接使用 API 返回的 base64 数据
 * 每个风格使用最具代表性的 prompt，让用户一眼识别
 */

import { nanoBananaGenerateImage } from "../server/_core/gemini";
import * as fs from "fs";

const STYLES = [
  { 
    id: "cel-shaded", 
    name: "日系赛璐璐风格", 
    prompt: "anime girl with short black hair in sailor school uniform, cel-shaded style, sharp bold outlines, flat color blocks with no gradients, classic 90s anime aesthetic like Evangelion, clean professional illustration, white background"
  },
  { 
    id: "light-novel", 
    name: "轻小说插画风格", 
    prompt: "beautiful anime girl with long silver hair and blue eyes, light novel cover illustration style, soft gradient shading, sparkling eyes, detailed hair highlights, romantic atmosphere, pastel colors, professional Japanese illustration"
  },
  { 
    id: "shinkai", 
    name: "新海诚电影风格", 
    prompt: "teenage girl looking at dramatic sunset sky with beautiful clouds, Makoto Shinkai Your Name movie style, photorealistic sky, lens flare, golden hour lighting, cinematic composition, emotional atmosphere"
  },
  { 
    id: "ghibli", 
    name: "吉卜力风格", 
    prompt: "cheerful young girl in simple dress standing in green meadow with wildflowers, Studio Ghibli Hayao Miyazaki style, warm earthy colors, hand-painted watercolor texture, whimsical and peaceful atmosphere, Totoro movie aesthetic"
  },
  { 
    id: "magical-girl", 
    name: "魔法少女风格", 
    prompt: "magical girl in pink frilly costume with ribbons and bows, holding magic wand with heart, sparkling stars and glitter effects, Sailor Moon style, dreamy pastel pink and purple colors, transformation pose"
  },
  { 
    id: "chibi", 
    name: "Q版萌系风格", 
    prompt: "super cute chibi character with huge sparkling eyes, 2-head proportion body, round face, tiny hands, kawaii expression, simple pastel background, Japanese SD style mascot character"
  },
  { 
    id: "chinese-ink", 
    name: "上美水墨动画风", 
    prompt: "elegant Chinese lady in flowing hanfu robes, traditional Chinese ink wash painting style, black ink brushstrokes on white, minimalist composition, Shanghai Animation Film Studio aesthetic, poetic and ethereal"
  },
  { 
    id: "chinese-3d", 
    name: "3D国漫风格", 
    prompt: "handsome young martial artist in ancient Chinese warrior armor, Chinese 3D donghua style like Ne Zha movie, dynamic pose, flowing ink splash effects, dramatic lighting, fantasy wuxia aesthetic"
  },
  { 
    id: "chinese-classical", 
    name: "国风古典风格", 
    prompt: "beautiful Chinese princess in elaborate traditional hanfu with hair ornaments, classical Chinese painting style, elegant pose, ink mountain landscape background, Heaven Official's Blessing aesthetic"
  },
  { 
    id: "pixar-disney", 
    name: "皮克斯/迪士尼3D风格", 
    prompt: "cute 3D animated character with big expressive eyes, round friendly face, Pixar Disney animation style, warm studio lighting, soft subsurface skin, colorful and cheerful, Coco or Inside Out aesthetic"
  },
  { 
    id: "american-comic", 
    name: "美式漫画风格", 
    prompt: "muscular superhero in dynamic action pose, American Marvel DC comic book style, bold black ink outlines, dramatic shading with halftone dots, high contrast colors, powerful heroic composition"
  },
  { 
    id: "cartoon-simple", 
    name: "卡通简约风格", 
    prompt: "quirky cartoon character with exaggerated features, Adventure Time or Rick and Morty style, simple bold outlines, flat bright colors, playful and humorous expression, minimalist design"
  },
  { 
    id: "cyberpunk", 
    name: "赛博朋克风格", 
    prompt: "cyberpunk girl with neon glowing cybernetic implants, futuristic city night background with holographic signs, Blade Runner aesthetic, purple and cyan neon lighting, rain reflections, dark sci-fi atmosphere"
  },
  { 
    id: "painterly-fantasy", 
    name: "厚涂幻想风格", 
    prompt: "epic fantasy warrior in ornate armor, digital painting with visible brushstrokes, dramatic chiaroscuro lighting, rich oil painting texture, concept art style, Lord of the Rings aesthetic"
  },
  { 
    id: "semi-realistic", 
    name: "半写实动漫风格", 
    prompt: "beautiful young woman portrait, semi-realistic anime style, detailed realistic skin texture and lighting, anime-styled large eyes, Final Fantasy CG render aesthetic, 2.5D illustration"
  },
  { 
    id: "pixel-art", 
    name: "复古像素风格", 
    prompt: "retro pixel art character sprite, 16-bit SNES game style, limited color palette, visible pixels, nostalgic 90s video game aesthetic, full body standing pose, transparent background"
  },
];

async function main() {
  console.log("开始生成风格示例图片...\n");
  
  const results: Record<string, string> = {};
  
  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i];
    console.log(`[${i + 1}/${STYLES.length}] 生成: ${style.name}`);
    
    try {
      const result = await nanoBananaGenerateImage({
        prompt: style.prompt,
        imageSize: "1K",
      });
      
      if (result.images && result.images.length > 0) {
        const img = result.images[0];
        results[style.id] = `data:${img.mimeType};base64,${img.base64}`;
        console.log(`  ✓ 成功 (${Math.round(img.base64.length / 1024)}KB)`);
      } else {
        console.log(`  ✗ 无图片返回`);
      }
    } catch (e) {
      console.error(`  ✗ 错误: ${e}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // 写入文件
  const output = `/home/ubuntu/ai-creative-studio-v2/client/src/data/styleImages.ts`;
  let content = `// 风格示例图片 Base64 (自动生成)\n// ${new Date().toISOString()}\n\nexport const STYLE_IMAGES: Record<string, string> = {\n`;
  for (const [id, data] of Object.entries(results)) {
    if (data) content += `  "${id}": "${data}",\n`;
  }
  content += `};\n`;
  
  fs.mkdirSync("/home/ubuntu/ai-creative-studio-v2/client/src/data", { recursive: true });
  fs.writeFileSync(output, content);
  
  console.log(`\n完成! ${Object.keys(results).filter(k => results[k]).length}/16 张图片`);
  console.log(`保存到: ${output}`);
}

main().catch(console.error);
