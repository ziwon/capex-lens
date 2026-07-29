import { describe, expect, it } from "vitest";
import { classifyRegime, maxDrawdown, robustZScore, totalReturn, weightedScore } from "./index";

describe("indicator calculations", () => {
  it("calculates total return", () => expect(totalReturn([100, 105, 110])).toBeCloseTo(10));
  it("calculates maximum drawdown", () => expect(maxDrawdown([100, 120, 90, 105])).toBeCloseTo(-25));
  it("returns null when coverage is insufficient", () => {
    expect(weightedScore([{ value: 30, weight: 0.4 }, { value: null, weight: 0.6 }])).toBeNull();
  });
  it("renormalizes available weights", () => {
    expect(weightedScore([{ value: 50, weight: 0.5 }, { value: -10, weight: 0.3 }, { value: null, weight: 0.2 }], 0.7)).toBe(28);
  });
  it("uses the previous regime inside the neutral band", () => {
    expect(classifyRegime({ supplyScore: -4, monetizationScore: 6, previousRegime: "capex_expansion" })).toBe("capex_expansion");
  });
  it("classifies a healthy reset", () => expect(classifyRegime({ supplyScore: -42, monetizationScore: 22 })).toBe("healthy_reset"));
  it("computes a robust z-score", () => {
    const score = robustZScore(15, [9, 10, 10, 11, 12, 12, 13]);
    expect(score).not.toBeNull();
    expect(score as number).toBeGreaterThan(1);
  });
});
