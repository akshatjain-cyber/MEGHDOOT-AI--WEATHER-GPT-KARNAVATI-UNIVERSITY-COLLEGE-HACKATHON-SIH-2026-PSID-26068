import { describe, expect, it } from "vitest";
import { weatherUnavailable } from "./routers";

describe("weather fallback", () => {
  it("returns stable empty weather collections with an unavailable status", () => {
    const result = weatherUnavailable();
    expect(result.providerStatus).toBe("unavailable");
    expect(result.providerMessage).toContain("temporarily unavailable");
    expect(result.current).toEqual({});
    expect(result.hourly.time).toEqual([]);
    expect(result.daily.time).toEqual([]);
  });
});
