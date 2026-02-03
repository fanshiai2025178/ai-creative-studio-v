/**
 * Google Gemini API Integration
 * 
 * This module provides a unified interface for Google Gemini API,
 * supporting:
 * - Text generation (LLM) via Gemini models
 * - Image generation via Nano Banana (gemini-3-pro-image-preview)
 * - Image editing via Nano Banana (text + image to image)
 * 
 * Environment Variables:
 * - GEMINI_API_KEY: Your Google Gemini API key (optional, users provide their own)
 * 
 * Note: This version is designed for servers outside mainland China,
 * which can directly access Google Gemini API without proxy.
 */

import { GoogleGenAI } from "@google/genai";

// 缓存不同 API Key 的客户端
const clientCache = new Map<string, GoogleGenAI>();

function getGeminiClient(userApiKey?: string): GoogleGenAI {
  // 必须使用用户的 API Key（系统不再提供默认 Key）
  if (!userApiKey) {
    throw new Error("请先在设置中配置您的 Gemini API Key");
  }
  const apiKey = userApiKey;
  
  // 检查缓存
  if (clientCache.has(apiKey)) {
    return clientCache.get(apiKey)!;
  }
  
  // 创建新客户端并缓存（直接调用 Google API，无需代理）
  const client = new GoogleGenAI({ apiKey });
  clientCache.set(apiKey, client);
  return client;
}

// ==================== Types ====================

export type GeminiRole = "user" | "model";

export type GeminiTextPart = {
  text: string;
};

export type GeminiImagePart = {
  inlineData: {
    mimeType: string;
    data: string; // base64
  };
};

export type GeminiPart = GeminiTextPart | GeminiImagePart | string;

export type GeminiContent = {
  role: GeminiRole;
  parts: GeminiPart[];
};

export type GeminiGenerateOptions = {
  model?: string;
  contents: GeminiContent[] | string;
  systemInstruction?: string;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  };
  apiKey?: string;  // 用户的 Gemini API Key
};

export type GeminiGenerateResult = {
  text: string;
  raw: unknown;
};

// Nano Banana Image Generation Types
export type NanoBananaModel = "gemini-3-pro-image-preview";
export type NanoBananaAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "5:4";
export type NanoBananaImageSize = "1K" | "2K" | "4K";

export type NanoBananaImageOptions = {
  prompt: string;
  model?: NanoBananaModel;
  referenceImages?: Array<{
    base64: string;
    mimeType: string;
  }>;
  aspectRatio?: NanoBananaAspectRatio;
  imageSize?: NanoBananaImageSize;
  // Pro-only features
  useGoogleSearch?: boolean; // Grounding with Google Search (Pro only)
  useThinking?: boolean; // Enable Thinking mode for complex prompts (Pro only)
  apiKey?: string;  // 用户的 Gemini API Key
};

export type NanoBananaImageResult = {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
  text?: string;
};

// Legacy Imagen Types (for backward compatibility)
export type GeminiImageGenerateOptions = {
  prompt: string;
  model?: string;
  numberOfImages?: number;
  aspectRatio?: string;
  negativePrompt?: string;
};

export type GeminiImageGenerateResult = {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
};

// ==================== Text Generation ====================

/**
 * Generate text content using Gemini models
 */
export async function geminiGenerateContent(
  options: GeminiGenerateOptions
): Promise<GeminiGenerateResult> {
  const client = getGeminiClient(options.apiKey);
  const model = options.model || "gemini-3-flash-preview";

  // Convert simple string to contents format
  let contents: GeminiContent[];
  if (typeof options.contents === "string") {
    contents = [{ role: "user", parts: [{ text: options.contents }] }];
  } else {
    contents = options.contents;
  }

  // Build request config
  const config: Record<string, unknown> = {};
  
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }
  
  if (options.generationConfig) {
    config.generationConfig = options.generationConfig;
  }

  const response = await client.models.generateContent({
    model,
    contents: contents as any,
    config: config as any,
  });

  // Extract text from response
  const text = response.text || "";

  return {
    text,
    raw: response,
  };
}

/**
 * Convert OpenAI-style messages to Gemini format
 */
export function convertMessagesToGemini(
  messages: Array<{ role: string; content: string }>
): { contents: GeminiContent[]; systemInstruction?: string } {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini uses systemInstruction instead of system role
      systemInstruction = (systemInstruction || "") + msg.content + "\n";
    } else {
      const role: GeminiRole = msg.role === "assistant" ? "model" : "user";
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
  }

  return { contents, systemInstruction: systemInstruction?.trim() };
}

// ==================== Nano Banana Image Generation ====================

/**
 * Generate images using Nano Banana (Gemini native image generation)
 * 
 * This is the recommended method for image generation as it supports:
 * - Text-to-image generation
 * - Image-to-image editing (with reference images)
 * - Multi-turn conversation editing
 * - Up to 14 reference images
 * - 4K output resolution
 */
export async function nanoBananaGenerateImage(
  options: NanoBananaImageOptions
): Promise<NanoBananaImageResult> {
  const client = getGeminiClient(options.apiKey);
  const model = options.model || "gemini-3-pro-image-preview";

  // Build the content parts
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  
  // Add text prompt
  parts.push({ text: options.prompt });
  
  // Add reference images if provided
  if (options.referenceImages && options.referenceImages.length > 0) {
    for (const img of options.referenceImages) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
  }

  // Build config
  const config: Record<string, unknown> = {
    responseModalities: ['TEXT', 'IMAGE'],
  };
  
  // Add image config if specified
  if (options.aspectRatio || options.imageSize) {
    config.imageConfig = {};
    if (options.aspectRatio) {
      (config.imageConfig as Record<string, unknown>).aspectRatio = options.aspectRatio;
    }
    if (options.imageSize) {
      (config.imageConfig as Record<string, unknown>).imageSize = options.imageSize;
    }
  }
  
  // Add Google Search grounding for Pro model
  if (options.useGoogleSearch && model === "gemini-3-pro-image-preview") {
    config.tools = [{ googleSearch: {} }];
  }
  
  // Enable Thinking mode for Pro model (default enabled for complex prompts)
  // Thinking mode helps the model reason through complex prompts before generating
  if (model === "gemini-3-pro-image-preview") {
    // Thinking is enabled by default for Pro model unless explicitly disabled
    if (options.useThinking !== false) {
      config.thinkingConfig = {
        thinkingBudget: 1024, // Allow model to think before generating
      };
    }
  }

  const response = await client.models.generateContent({
    model,
    contents: parts as any,
    config: config as any,
  });

  // Extract images and text from response
  const images: Array<{ base64: string; mimeType: string }> = [];
  let text: string | undefined;

  const candidates = (response as any).candidates;
  if (candidates && candidates[0]?.content?.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.text) {
        text = part.text;
      } else if (part.inlineData) {
        images.push({
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        });
      }
    }
  }

  return { images, text };
}

/**
 * Generate image with text-to-image (simplified interface)
 */
export async function generateImageWithNanoBanana(
  prompt: string,
  options?: {
    model?: NanoBananaModel;
    aspectRatio?: NanoBananaAspectRatio;
    imageSize?: NanoBananaImageSize;
    useGoogleSearch?: boolean;
    apiKey?: string;
  }
): Promise<{ base64: string; mimeType: string } | null> {
  const result = await nanoBananaGenerateImage({
    prompt,
    model: options?.model,
    aspectRatio: options?.aspectRatio,
    imageSize: options?.imageSize,
    useGoogleSearch: options?.useGoogleSearch,
    apiKey: options?.apiKey,
  });
  
  return result.images[0] || null;
}

/**
 * Edit image with reference (image-to-image)
 */
export async function editImageWithNanoBanana(
  prompt: string,
  referenceImage: { base64: string; mimeType: string },
  options?: {
    model?: NanoBananaModel;
    aspectRatio?: NanoBananaAspectRatio;
    imageSize?: NanoBananaImageSize;
    apiKey?: string;
  }
): Promise<{ base64: string; mimeType: string } | null> {
  const result = await nanoBananaGenerateImage({
    prompt,
    model: options?.model,
    referenceImages: [referenceImage],
    aspectRatio: options?.aspectRatio,
    imageSize: options?.imageSize,
    apiKey: options?.apiKey,
  });
  
  return result.images[0] || null;
}

// ==================== Legacy Imagen Support ====================

/**
 * Generate images using Imagen models (legacy)
 * @deprecated Use nanoBananaGenerateImage instead for better features
 */
export async function geminiGenerateImages(
  options: GeminiImageGenerateOptions
): Promise<GeminiImageGenerateResult> {
  const client = getGeminiClient();
  const model = options.model || "imagen-4.0-generate-001";

  const config: Record<string, unknown> = {};
  
  if (options.numberOfImages) {
    config.numberOfImages = options.numberOfImages;
  }
  
  if (options.aspectRatio) {
    config.aspectRatio = options.aspectRatio;
  }
  
  if (options.negativePrompt) {
    config.negativePrompt = options.negativePrompt;
  }

  const response = await client.models.generateImages({
    model,
    prompt: options.prompt,
    config: config as any,
  });

  const images: Array<{ base64: string; mimeType: string }> = [];
  
  if (response.generatedImages) {
    for (const img of response.generatedImages) {
      if (img.image?.imageBytes) {
        images.push({
          base64: img.image.imageBytes,
          mimeType: img.image.mimeType || "image/png",
        });
      }
    }
  }

  return { images };
}

// ==================== Compatibility Layer ====================

/**
 * Invoke LLM with OpenAI-compatible interface
 * This provides backward compatibility with existing code
 */
export async function invokeGeminiLLM(params: {
  messages: Array<{ role: string; content: string }>;
  response_format?: {
    type: string;
    json_schema?: {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  };
  apiKey?: string;  // 用户的 API Key（必须传递）
}): Promise<{
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}> {
  const { contents, systemInstruction } = convertMessagesToGemini(params.messages);

  const generationConfig: Record<string, unknown> = {};
  
  // Handle JSON response format
  if (params.response_format?.type === "json_schema" && params.response_format.json_schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = params.response_format.json_schema.schema;
  } else if (params.response_format?.type === "json_object") {
    generationConfig.responseMimeType = "application/json";
  }

  const result = await geminiGenerateContent({
    contents,
    systemInstruction,
    generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
    apiKey: params.apiKey,  // 传递用户的 API Key
  });

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: result.text,
        },
      },
    ],
  };
}
