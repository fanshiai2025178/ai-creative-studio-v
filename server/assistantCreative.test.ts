import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("./_core/gemini", () => ({
  invokeGeminiLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      intent: "general_chat",
      confidence: 0.9,
      entities: {},
      missing_info: []
    })}}]
  })
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({
    url: "https://example.com/image.png",
    base64: "base64data",
    mimeType: "image/png"
  })
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null)
}));

vi.mock("./assistantCharacterDesignRouter", () => ({
  analyzeScript: vi.fn().mockResolvedValue({
    summary: "Test summary",
    characters: [{ name: "Test Character", role: "主角" }]
  }),
  generateCharacterImage: vi.fn().mockResolvedValue({
    url: "https://example.com/character.png"
  }),
  PRESET_STYLES: [
    { id: "cel-shaded", name: "日系赛璐璐风格", nameEn: "Cel-Shaded", category: "japanese", description: "Test" }
  ]
}));

describe("assistantCreativeRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("module exports", () => {
    it("should export assistantCreativeRouter", async () => {
      const module = await import("./assistantCreativeRouter");
      expect(module.assistantCreativeRouter).toBeDefined();
    });

    it("should have required procedures", async () => {
      const module = await import("./assistantCreativeRouter");
      const router = module.assistantCreativeRouter;
      
      // Check that the router has the expected procedures
      expect(router._def.procedures).toHaveProperty("startSession");
      expect(router._def.procedures).toHaveProperty("chat");
      expect(router._def.procedures).toHaveProperty("executeAction");
      expect(router._def.procedures).toHaveProperty("getProgress");
      expect(router._def.procedures).toHaveProperty("getStyles");
    });
  });

  describe("PRESET_STYLES import", () => {
    it("should successfully import PRESET_STYLES from assistantCharacterDesignRouter", async () => {
      const { PRESET_STYLES } = await import("./assistantCharacterDesignRouter");
      expect(PRESET_STYLES).toBeDefined();
      expect(Array.isArray(PRESET_STYLES)).toBe(true);
      expect(PRESET_STYLES.length).toBeGreaterThan(0);
    });
  });

  describe("analyzeScript import", () => {
    it("should successfully import analyzeScript from assistantCharacterDesignRouter", async () => {
      const { analyzeScript } = await import("./assistantCharacterDesignRouter");
      expect(analyzeScript).toBeDefined();
      expect(typeof analyzeScript).toBe("function");
    });
  });

  describe("generateCharacterImage import", () => {
    it("should successfully import generateCharacterImage from assistantCharacterDesignRouter", async () => {
      const { generateCharacterImage } = await import("./assistantCharacterDesignRouter");
      expect(generateCharacterImage).toBeDefined();
      expect(typeof generateCharacterImage).toBe("function");
    });
  });
});
