import { describe, expect, it } from "vitest";
import { GoogleGenAI } from "@google/genai";

describe("Gemini API Key Validation", () => {
  it("should validate GEMINI_API_KEY is configured and working", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // Check if API key is set
    expect(apiKey).toBeDefined();
    expect(apiKey).not.toBe("");
    
    // Try to initialize the client and make a simple call
    const client = new GoogleGenAI({ apiKey: apiKey! });
    
    // Make a lightweight API call to validate the key
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: "Say hello in one word" }] }],
    });
    
    // Check if we got a valid response
    expect(response).toBeDefined();
    expect(response.text).toBeDefined();
  }, 30000); // 30 second timeout for API call
});
