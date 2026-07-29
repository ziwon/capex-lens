import { describe, expect, it } from "vitest";
import {
  classifyRegime,
  currentDrawdown,
  maxDrawdown,
  movingAverage,
  robustZScore,
  scoreFromZ,
  totalReturn,
  trendDirection,
  weightedScore,
} from "./index";

describe("indicator calculations", () => {
  it("calculates total return", () => expect(totalReturn([100, 105, 110])).toBeCloseTo(10));
  it("calculates maximum drawdown", () => expect(maxDrawdown([100, 120, 90, 105])).toBeCloseTo(-25));
  it("calculates current drawdown from the rolling high", () => expect(currentDrawdown([100, 120, 90, 108], 3)).toBeCloseTo(-10));
  it("calculates a trailing moving average", () => expect(movingAverage([1, 2, 3, 4, 5], 3)).toBe(4));
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
  it("computes a robust z-score and bounded score", () => {
    const zScore = robustZScore(15, [9, 10, 10, 11, 12, 12, 13]);
    expect(zScore).not.toBeNull();
    expect(zScore as number).toBeGreaterThan(1);
    expect(scoreFromZ(zScore)).toBeGreaterThan(0);
    expect(scoreFromZ(100)).toBe(100);
  });
  it("classifies score direction changes", () => {
    expect(trendDirection(20, 10)).toBe("rising");
    expect(trendDirection(-20, -10)).toBe("falling");
    expect(trendDirection(11, 10)).toBe("stable");
  });
});
