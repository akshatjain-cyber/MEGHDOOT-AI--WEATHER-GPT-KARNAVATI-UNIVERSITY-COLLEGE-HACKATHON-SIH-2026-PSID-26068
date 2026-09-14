import { describe, expect, it } from "vitest";
import { classifyRescueKind, clampRescueRadius } from "./routers";

describe("rescue geofence helpers", () => {
  it("keeps the operating radius inside the supported India search range", () => {
    expect(clampRescueRadius(2)).toBe(5);
    expect(clampRescueRadius(25)).toBe(25);
    expect(clampRescueRadius(999)).toBe(700);
  });

  it("distinguishes refugee sites from hospitals and general relief facilities", () => {
    expect(classifyRescueKind({ amenity: "hospital" })).toBe("hospital");
    expect(classifyRescueKind({ social_facility: "refugee_site" })).toBe("refugee");
    expect(classifyRescueKind({ amenity: "shelter" })).toBe("shelter");
    expect(classifyRescueKind({ emergency: "designated" })).toBe("relief");
  });
});
