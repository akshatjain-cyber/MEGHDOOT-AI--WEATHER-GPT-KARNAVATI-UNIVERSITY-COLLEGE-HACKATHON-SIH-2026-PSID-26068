import { describe, expect, it } from "vitest";
import { buildWeatherSystemPrompt } from "./routers";

describe("language preference prompts", () => {
  it("asks the model to answer in the explicitly selected Spanish language", () => {
    expect(buildWeatherSystemPrompt("es-ES")).toContain("Answer in Spanish");
  });

  it("falls back safely for unsupported language codes", () => {
    expect(buildWeatherSystemPrompt("not-a-language")).toContain("Answer in English");
  });
});
