/**
 * Image generation helper using Google Gemini Nano Banana API
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing with reference image:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 * 
 * Using Nano Banana Pro for higher quality:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Professional product photo",
 *     model: "gemini-3-pro-image-preview",
 *     aspectRatio: "16:9",
 *     imageSize: "4K"
 *   });
 */
import { storagePut } from "server/storage";
import { 
  nanoBananaGenerateImage, 
  NanoBananaModel, 
  NanoBananaAspectRatio, 
  NanoBananaImageSize 
} from "./gemini";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  // New options for Nano Banana
  model?: NanoBananaModel;
  aspectRatio?: NanoBananaAspectRatio;
  imageSize?: NanoBananaImageSize;
  useGoogleSearch?: boolean;
  // 用户的 API Key（优先使用）
  apiKey?: string;
};

export type GenerateImageResponse = {
  url?: string;
  fileKey?: string; // OSS file key
  base64?: string; // Base64 encoded image data as fallback
  mimeType?: string; // MIME type of the image
  text?: string; // Optional text response from the model
};

/**
 * Fetch image from URL and convert to base64
 * Returns null if fetch fails (e.g., 403 from S3/CloudFront)
 */
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[ImageGeneration] 跳过无法访问的图片 URL (${response.status}): ${url.substring(0, 50)}...`);
      return null;
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";
    return { base64, mimeType: contentType };
  } catch (error) {
    console.log(`[ImageGeneration] 获取图片失败: ${url.substring(0, 50)}...`, error);
    return null;
  }
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  // Convert original images to base64 format if needed
  const referenceImages: Array<{ base64: string; mimeType: string }> = [];
  
  if (options.originalImages && options.originalImages.length > 0) {
    for (const img of options.originalImages) {
      if (img.b64Json) {
        // Already base64
        referenceImages.push({
          base64: img.b64Json,
          mimeType: img.mimeType || "image/png",
        });
      } else if (img.url) {
        // Fetch from URL (skip if fetch fails)
        const fetched = await fetchImageAsBase64(img.url);
        if (fetched) {
          referenceImages.push(fetched);
        }
      }
    }
  }

  // Call Nano Banana API
  console.log(`[ImageGeneration] Calling Nano Banana API with prompt: ${options.prompt.substring(0, 100)}...`);
  const result = await nanoBananaGenerateImage({
    prompt: options.prompt,
    model: options.model,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    aspectRatio: options.aspectRatio,
    imageSize: options.imageSize,
    useGoogleSearch: options.useGoogleSearch,
    apiKey: options.apiKey, // 使用用户的 API Key
  });

  console.log(`[ImageGeneration] Nano Banana returned ${result.images?.length || 0} images`);
  if (!result.images || result.images.length === 0) {
    console.error(`[ImageGeneration] No images returned from Nano Banana`);
    throw new Error("Image generation failed: no images returned");
  }

  // Get the first generated image
  const generatedImage = result.images[0];
  const buffer = Buffer.from(generatedImage.base64, "base64");

  // Save to S3
  console.log(`[ImageGeneration] Saving image to S3...`);
  const fileKey = `generated/${Date.now()}.png`;
  const { key, url } = await storagePut(
    fileKey,
    buffer,
    generatedImage.mimeType
  );
  console.log(`[ImageGeneration] Image uploaded to S3 with key: ${key}, URL: ${url}`);
  
  // Return both URL and base64 as fallback (S3 URL may have 403 issues)
  return {
    url,
    fileKey: key,
    base64: generatedImage.base64,
    mimeType: generatedImage.mimeType,
    text: result.text,
  };
}

/**
 * Generate image with Nano Banana Pro (high quality)
 */
export async function generateImagePro(
  options: Omit<GenerateImageOptions, "model">
): Promise<GenerateImageResponse> {
  return generateImage({
    ...options,
    model: "gemini-3-pro-image-preview",
  });
}

/**
 * Generate image with Nano Banana Pro (standard quality with Thinking mode)
 * Uses gemini-3-pro-image-preview for high quality output
 */
export async function generateImageFast(
  options: Omit<GenerateImageOptions, "model">
): Promise<GenerateImageResponse> {
  return generateImage({
    ...options,
    model: "gemini-3-pro-image-preview",
  });
}
