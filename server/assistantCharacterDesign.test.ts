import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// Mock the dependencies
vi.mock('./_core/gemini', () => ({
  invokeGeminiLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "测试剧情概要",
          characters: [
            {
              name: "张三",
              role: "主角",
              age: "25岁",
              personality: "勇敢正直",
              appearance: "黑发，高大，穿着现代休闲装"
            },
            {
              name: "李四",
              role: "配角",
              age: "30岁",
              personality: "机智幽默",
              appearance: "短发，戴眼镜"
            }
          ],
          setting: "现代都市",
          suggestedStyle: "日系动漫风格"
        })
      }
    }]
  })
}));

vi.mock('./_core/imageGeneration', () => ({
  generateImage: vi.fn().mockResolvedValue({
    url: "https://example.com/generated-image.png"
  })
}));

function createTestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe('智能小助手 - 角色设计 API', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = appRouter.createCaller(ctx);
  });

  describe('startSession', () => {
    it('应该创建新会话并返回欢迎消息', async () => {
      const result = await caller.assistantCharacterDesign.startSession();
      
      expect(result).toHaveProperty('sessionId');
      expect(result.sessionId).toBeTruthy();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('assistant');
      expect(result.messages[0].type).toBe('text');
      expect(result.messages[0].content).toContain('角色设计助手');
      expect(result.step).toBe('init');
    });
  });

  describe('chat - 剧本分析流程', () => {
    it('应该分析剧本并返回角色列表', async () => {
      // 先创建会话
      const session = await caller.assistantCharacterDesign.startSession();
      
      // 发送剧本内容
      const result = await caller.assistantCharacterDesign.chat({
        sessionId: session.sessionId,
        message: "这是一个关于年轻程序员创业的故事。主角张三是一个25岁的程序员，他和好友李四一起创办了一家AI公司。"
      });
      
      // 剧本分析后会返回分析结果和风格选择消息
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      // 检查是否有剧本分析消息
      const scriptAnalysisMsg = result.messages.find(m => m.type === 'script_analysis');
      expect(scriptAnalysisMsg).toBeDefined();
      expect(scriptAnalysisMsg?.data?.scriptAnalysis).toBeDefined();
      expect(result.step).toBe('script_analyzed');
    });
  });

  describe('getSession', () => {
    it('应该返回会话状态', async () => {
      const session = await caller.assistantCharacterDesign.startSession();
      
      const result = await caller.assistantCharacterDesign.getSession({
        sessionId: session.sessionId
      });
      
      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe(session.sessionId);
      expect(result?.step).toBe('init');
      expect(result?.messages).toHaveLength(1);
    });

    it('对于不存在的会话应该返回 null', async () => {
      const result = await caller.assistantCharacterDesign.getSession({
        sessionId: 'non-existent-session-id'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('endSession', () => {
    it('应该成功结束会话', async () => {
      const session = await caller.assistantCharacterDesign.startSession();
      
      const result = await caller.assistantCharacterDesign.endSession({
        sessionId: session.sessionId
      });
      
      expect(result.success).toBe(true);
      
      // 验证会话已被删除
      const checkSession = await caller.assistantCharacterDesign.getSession({
        sessionId: session.sessionId
      });
      expect(checkSession).toBeNull();
    });
  });

  describe('searchImages', () => {
    it('应该返回搜索结果', async () => {
      const session = await caller.assistantCharacterDesign.startSession();
      
      const result = await caller.assistantCharacterDesign.searchImages({
        sessionId: session.sessionId,
        keywords: ['日系动漫风格', '角色设计']
      });
      
      expect(result.searchResults).toBeDefined();
      expect(result.searchResults.length).toBeGreaterThan(0);
      expect(result.searchResults[0]).toHaveProperty('title');
      expect(result.searchResults[0]).toHaveProperty('keyword');
      expect(result.searchResults[0]).toHaveProperty('images');
    });

    it('对于不存在的会话应该抛出错误', async () => {
      await expect(caller.assistantCharacterDesign.searchImages({
        sessionId: 'non-existent-session',
        keywords: ['test']
      })).rejects.toThrow('会话不存在或已过期');
    });
  });

  describe('generateCharacter', () => {
    it('应该生成角色图片', async () => {
      const session = await caller.assistantCharacterDesign.startSession();
      
      const result = await caller.assistantCharacterDesign.generateCharacter({
        sessionId: session.sessionId,
        characterInfo: {
          name: "张三",
          role: "主角",
          age: "25岁",
          personality: "勇敢正直",
          appearance: "黑发，高大"
        },
        style: "日系动漫风格"
      });
      
      expect(result.url).toBeDefined();
      expect(result.characterName).toBe("张三");
      expect(result.description).toContain("张三");
    });

    it('对于不存在的会话应该抛出错误', async () => {
      await expect(caller.assistantCharacterDesign.generateCharacter({
        sessionId: 'non-existent-session',
        characterInfo: {
          name: "测试",
          role: "主角"
        },
        style: "测试风格"
      })).rejects.toThrow('会话不存在或已过期');
    });
  });

  describe('getGenerationProgress', () => {
    it('应该返回初始状态的进度信息', async () => {
      const session = await caller.assistantCharacterDesign.startSession();
      
      const result = await caller.assistantCharacterDesign.getGenerationProgress({
        sessionId: session.sessionId
      });
      
      expect(result).not.toBeNull();
      expect(result?.sessionId).toBe(session.sessionId);
      expect(result?.step).toBe('init');
      expect(result?.isGenerating).toBe(false);
      expect(result?.isCompleted).toBe(false);
      expect(result?.progress).toBe(0);
      expect(result?.total).toBe(0);
    });

    it('对于不存在的会话应该返回 null', async () => {
      const result = await caller.assistantCharacterDesign.getGenerationProgress({
        sessionId: 'non-existent-session'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('getPresetStyles', () => {
    it('应该返回预设风格列表', async () => {
      const result = await caller.assistantCharacterDesign.getPresetStyles();
      
      expect(result.styles).toBeDefined();
      expect(result.styles.length).toBeGreaterThan(0);
      expect(result.categories).toBeDefined();
      expect(result.categories.length).toBeGreaterThan(0);
      
      // 检查风格数据结构
      const firstStyle = result.styles[0];
      expect(firstStyle).toHaveProperty('id');
      expect(firstStyle).toHaveProperty('name');
      expect(firstStyle).toHaveProperty('nameEn');
      expect(firstStyle).toHaveProperty('category');
      expect(firstStyle).toHaveProperty('description');
      expect(firstStyle).toHaveProperty('prompt');
    });
  });

  describe('getStyleById', () => {
    it('应该返回指定风格的详情', async () => {
      const result = await caller.assistantCharacterDesign.getStyleById({
        styleId: 'cel-shaded'
      });
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cel-shaded');
      expect(result?.name).toBe('日系赛璐璐风格');
    });

    it('对于不存在的风格应该返回 null', async () => {
      const result = await caller.assistantCharacterDesign.getStyleById({
        styleId: 'non-existent-style'
      });
      
      expect(result).toBeNull();
    });
  });
});
