/**
 * 生成风格示例图片并上传到 S3
 */

import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";

// 风格数据
const STYLES = [
  { id: "cel-shaded", prompt: "anime character portrait, cel-shaded style, sharp clean lines, bold outlines, flat colors, minimal gradients, anime style, single character, upper body, white background" },
  { id: "light-novel", prompt: "anime character portrait, light novel illustration style, detailed anime art, soft lighting, vibrant colors, character portrait, single character, upper body, white background" },
  { id: "shinkai", prompt: "anime character portrait, Makoto Shinkai style, beautiful sky background, dramatic lighting, cinematic atmosphere, single character, upper body" },
  { id: "ghibli", prompt: "anime character portrait, Studio Ghibli style, warm natural colors, hand-drawn details, whimsical atmosphere, Hayao Miyazaki style, single character, upper body" },
  { id: "magical-girl", prompt: "anime character portrait, magical girl anime style, dreamy colors, sparkling effects, elegant costume, single character, upper body, white background" },
  { id: "chibi", prompt: "chibi character portrait, kawaii style, 2-head proportion, big eyes, cute expression, simple background, single character, full body" },
  { id: "chinese-ink", prompt: "Chinese ink painting style character portrait, traditional ink wash, elegant brushwork, minimalist, single character, upper body" },
  { id: "chinese-3d", prompt: "Chinese 3D animation style character portrait, modern Chinese animation, detailed rendering, single character, upper body" },
  { id: "chinese-classical", prompt: "Chinese classical painting style character portrait, traditional Chinese art, elegant robes, single character, upper body" },
  { id: "pixar-disney", prompt: "Pixar Disney 3D animation style character portrait, cute stylized 3D, expressive eyes, single character, upper body" },
  { id: "american-comic", prompt: "American comic book style character portrait, bold lines, dynamic shading, superhero style, single character, upper body" },
  { id: "cartoon-simple", prompt: "simple cartoon style character portrait, clean lines, flat colors, minimalist design, single character, upper body, white background" },
  { id: "cyberpunk", prompt: "cyberpunk style character portrait, neon lights, futuristic, high tech, single character, upper body, dark background" },
  { id: "painterly-fantasy", prompt: "painterly fantasy style character portrait, oil painting texture, rich colors, magical atmosphere, single character, upper body" },
  { id: "semi-realistic", prompt: "semi-realistic anime style character portrait, detailed rendering, realistic lighting, single character, upper body" },
  { id: "pixel-art", prompt: "pixel art style character portrait, retro game style, 16-bit aesthetic, single character, full body, simple background" },
];

export async function generateAllStyleThumbnails(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  for (const style of STYLES) {
    console.log(`Generating thumbnail for style: ${style.id}`);
    try {
      // 生成图片
      const result = await generateImage({
        prompt: style.prompt,
      });
      
      // 优先使用 base64 数据（S3 URL 可能有 403 问题）
      let imageBuffer: Buffer;
      if (result.base64) {
        imageBuffer = Buffer.from(result.base64, 'base64');
        console.log(`Using base64 data (length: ${result.base64.length})`);
      } else if (result.url) {
        console.log(`Generated image URL: ${result.url}`);
        // 回退：下载图片
        const response = await fetch(result.url);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.status}`);
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error('Image generation returned no data');
      }
      
      // 上传到 S3
      const key = `style-thumbnails/${style.id}-${Date.now()}.png`;
      const { url } = await storagePut(key, imageBuffer, "image/png");
      
      console.log(`Uploaded to S3: ${url}`);
      results[style.id] = url;
      
    } catch (error) {
      console.error(`Failed to generate thumbnail for ${style.id}:`, error);
      results[style.id] = ""; // 失败时设置为空
    }
  }
  
  return results;
}

// 单独生成一个风格的图片
export async function generateSingleStyleThumbnail(styleId: string): Promise<string> {
  const style = STYLES.find(s => s.id === styleId);
  if (!style) {
    throw new Error(`Style not found: ${styleId}`);
  }
  
  console.log(`Generating thumbnail for style: ${style.id}`);
  
  // 生成图片
  const result = await generateImage({
    prompt: style.prompt,
  });
  
  // 优先使用 base64 数据（S3 URL 可能有 403 问题）
  let imageBuffer: Buffer;
  if (result.base64) {
    imageBuffer = Buffer.from(result.base64, 'base64');
    console.log(`Using base64 data (length: ${result.base64.length})`);
  } else if (result.url) {
    console.log(`Generated image URL: ${result.url}`);
    // 回退：下载图片
    const response = await fetch(result.url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    imageBuffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Image generation returned no data');
  }
  
  // 上传到 S3
  const key = `style-thumbnails/${style.id}-${Date.now()}.png`;
  const { url } = await storagePut(key, imageBuffer, "image/png");
  
  console.log(`Uploaded to S3: ${url}`);
  return url;
}
