import { describe, expect, it } from "vitest";
import { relativeChange, signed, gradeDescription } from "./workspace";

describe("workspace comparison", () => {
  it("does not turn missing observations into zero or divide by zero", () => {
    expect(relativeChange(null, 100)).toBeNull();
    expect(relativeChange(1, 0)).toBeNull();
    expect(relativeChange(28.2, 100)).toBeCloseTo(-71.8);
  });
  it("uses a typographic negative sign and keeps missing data explicit", () => {
    expect(signed(-20.563, 2)).toBe("−20.56");
    expect(signed(null)).toBe("—");
    expect(gradeDescription("C", "zh-TW")).toContain("分辨不出來");
  });
});
