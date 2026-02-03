/**
 * LLM Integration using Google Gen AI SDK
 * 
 * This module provides a unified interface for text generation using Google Gemini API.
 * All API calls use the official @google/genai SDK for best performance and features.
 * 
 * Note: This version is designed for servers outside mainland China,
 * which can directly access Google Gemini API without proxy.
 */

import { GoogleGenAI, Type } from "@google/genai";

// ==================== Types ====================

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  apiKey?: string;  // 用户的 Gemini API Key
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ==================== Client Cache ====================

const clientCache = new Map<string, GoogleGenAI>();

function getGeminiClient(userApiKey?: string): GoogleGenAI {
  if (!userApiKey) {
    throw new Error("请先在设置中配置您的 Gemini API Key");
  }
  
  if (clientCache.has(userApiKey)) {
    return clientCache.get(userApiKey)!;
  }
  
  const client = new GoogleGenAI({ apiKey: userApiKey });
  clientCache.set(userApiKey, client);
  return client;
}

// ==================== Helper Functions ====================

/**
 * 清理文本中的特殊 Unicode 字符，防止 API 调用时出现编码错误
 */
const sanitizeText = (text: string): string => {
  return text
    .replace(/[\u2000-\u200B\u202F\u205F\u3000\u00A0]/g, ' ')
    .replace(/[\uFEFF\u200C\u200D]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
};

/**
 * 将 URL 图片转换为 base64
 */
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // 处理 data URL
    if (url.startsWith('data:')) {
      const matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        return { mimeType: matches[1], base64: matches[2] };
      }
      return null;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[LLM] 跳过无法访问的图片 URL (${response.status}): ${url.substring(0, 50)}...`);
      return null;
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";
    return { base64, mimeType: contentType };
  } catch (error) {
    console.log(`[LLM] 获取图片失败: ${url.substring(0, 50)}...`, error);
    return null;
  }
}

/**
 * 将 OpenAI 格式的消息转换为 Gemini 格式
 */
async function convertMessagesToGemini(messages: Message[]): Promise<{
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }>;
  systemInstruction?: string;
}> {
  let systemInstruction: string | undefined;
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const text = typeof msg.content === "string" ? msg.content : 
        Array.isArray(msg.content) ? msg.content.map(c => typeof c === "string" ? c : (c as TextContent).text || "").join("\n") : "";
      systemInstruction = (systemInstruction || "") + sanitizeText(text) + "\n";
      continue;
    }

    const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    const contentArray = Array.isArray(msg.content) ? msg.content : [msg.content];
    
    for (const part of contentArray) {
      if (typeof part === "string") {
        parts.push({ text: sanitizeText(part) });
      } else if (part.type === "text") {
        parts.push({ text: sanitizeText(part.text) });
      } else if (part.type === "image_url" && part.image_url?.url) {
        // 将图片 URL 转换为 base64
        const imageData = await fetchImageAsBase64(part.image_url.url);
        if (imageData) {
          parts.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.base64,
            },
          });
        }
      } else if (part.type === "file_url" && part.file_url?.url) {
        // 处理文件 URL（音频、视频、PDF 等）
        const fileData = await fetchImageAsBase64(part.file_url.url);
        if (fileData) {
          parts.push({
            inlineData: {
              mimeType: part.file_url.mime_type || fileData.mimeType,
              data: fileData.base64,
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return { contents, systemInstruction: systemInstruction?.trim() };
}

/**
 * 将 OpenAI 格式的工具定义转换为 Gemini 格式
 */
function convertToolsToGemini(tools: Tool[]): Array<{
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}> {
  const functionDeclarations = tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));

  return [{ functionDeclarations }];
}

/**
 * 将 JSON Schema 转换为 Gemini 的 responseSchema 格式
 */
function convertJsonSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  // Gemini 使用类似的 JSON Schema 格式，但需要一些调整
  const converted: Record<string, unknown> = { ...schema };
  
  // 移除 Gemini 不支持的字段
  delete converted.$schema;
  delete converted.additionalProperties;
  
  return converted;
}

// ==================== Main LLM Function ====================

/**
 * 使用 Google Gen AI SDK 调用 LLM
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    apiKey: userApiKey,
  } = params;

  // 必须使用用户的 API Key
  if (!userApiKey) {
    throw new Error("请先在设置中配置您的 Gemini API Key");
  }

  const client = getGeminiClient(userApiKey);
  const model = "gemini-3-flash-preview";  // 使用 Gemini 3 Flash（快速模型）

  console.log(`[LLM] 使用 Google Gen AI SDK 调用 ${model}`);

  // 转换消息格式
  const { contents, systemInstruction } = await convertMessagesToGemini(messages);

  // 构建配置
  const config: Record<string, unknown> = {};

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  // 处理工具调用
  if (tools && tools.length > 0) {
    config.tools = convertToolsToGemini(tools);
    
    // 处理 tool_choice
    const choice = toolChoice || tool_choice;
    if (choice) {
      if (choice === "none") {
        // 禁用工具调用
        config.toolConfig = { functionCallingConfig: { mode: "NONE" } };
      } else if (choice === "auto") {
        config.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
      } else if (choice === "required" || (typeof choice === "object" && "name" in choice)) {
        // 强制使用工具
        config.toolConfig = { functionCallingConfig: { mode: "ANY" } };
      }
    }
  }

  // 处理响应格式
  const format = responseFormat || response_format;
  const schema = outputSchema || output_schema;

  if (format?.type === "json_schema" && format.json_schema) {
    config.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: convertJsonSchemaToGemini(format.json_schema.schema),
    };
  } else if (format?.type === "json_object") {
    config.generationConfig = {
      responseMimeType: "application/json",
    };
  } else if (schema) {
    config.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: convertJsonSchemaToGemini(schema.schema),
    };
  }

  // 调用 API
  const response = await client.models.generateContent({
    model,
    contents: contents as any,
    config: config as any,
  });

  // 解析响应
  const result: InvokeResult = {
    id: `gen-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [],
    usage: undefined,
  };

  // 提取文本内容和工具调用
  let textContent = "";
  const toolCalls: ToolCall[] = [];

  const candidates = (response as any).candidates;
  if (candidates && candidates[0]?.content?.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.text) {
        textContent += part.text;
      } else if (part.functionCall) {
        toolCalls.push({
          id: `call-${Date.now()}-${toolCalls.length}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }
  }

  // 如果没有从 candidates 获取到内容，尝试直接获取 text
  if (!textContent && !toolCalls.length) {
    textContent = response.text || "";
  }

  result.choices.push({
    index: 0,
    message: {
      role: "assistant",
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
  });

  // 提取 usage 信息
  const usageMetadata = (response as any).usageMetadata;
  if (usageMetadata) {
    result.usage = {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0,
    };
  }

  return result;
}
