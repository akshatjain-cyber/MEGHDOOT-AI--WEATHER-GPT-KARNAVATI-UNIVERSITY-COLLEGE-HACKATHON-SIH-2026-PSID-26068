import { describe, expect, it } from "vitest";
import { detectLanguageLocally, findSpeechVoice, speechChunks } from "./Home";

type TestVoice = Pick<SpeechSynthesisVoice, "lang" | "name">;

const voice = (lang: string, name: string) => ({ lang, name }) as SpeechSynthesisVoice;

describe("Meghdoot TTS helpers", () => {
  it("splits long responses into readable speech chunks", () => {
    const chunks = speechChunks(`${"Weather conditions remain stable. ".repeat(14)}Carry water and follow official warnings.`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 240)).toBe(true);
  });

  it("matches exact and alternate Indian-language voice labels", () => {
    const voices: TestVoice[] = [
      voice("en-US", "English US"),
      voice("hi-IN", "Hindi India"),
      voice("en-IN", "Gujarati India"),
    ];
    expect(findSpeechVoice(voices as SpeechSynthesisVoice[], "hi-IN")?.name).toBe("Hindi India");
    expect(findSpeechVoice(voices as SpeechSynthesisVoice[], "gu-IN")?.name).toBe("Gujarati India");
  });

  it("detects common Indian scripts locally without a network round trip", () => {
    expect(detectLanguageLocally("नमस्ते मौसम कैसा है")).toBe("hi-IN");
    expect(detectLanguageLocally("ગુજરાતીમાં જવાબ આપો")).toBe("gu-IN");
    expect(detectLanguageLocally("Will it rain today?")).toBe("en-IN");
  });
});
