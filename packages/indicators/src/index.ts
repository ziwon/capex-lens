import type { RegimeKey } from "@capex-lens/shared";

export interface WeightedComponent { value: number | null; weight: number; }
export interface RegimeInput {
  supplyScore: number;
  monetizationScore: number;
  previousRegime?: RegimeKey;
  neutralBand?: number;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

export function mean(values: number[]): number {
  if (values.length === 0) throw new Error("mean requires at least one value");
  values.forEach((value) => assertFinite(value, "value"));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) throw new Error("standardDeviation requires at least two values");
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("median requires at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) throw new Error("median invariant failed");
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? current) + current) / 2 : current;
}

export function robustZScore(value: number, history: number[]): number | null {
  assertFinite(value, "value");
  if (history.length < 5) return null;
  const center = median(history);
  const deviations = history.map((point) => Math.abs(point - center));
  const mad = median(deviations);
  if (mad === 0) return value === center ? 0 : Math.sign(value - center) * 3;
  return (value - center) / (1.4826 * mad);
}

export function clampScore(value: number): number {
  assertFinite(value, "score");
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export function weightedScore(components: WeightedComponent[], minimumCoverage = 0.7): number | null {
  if (components.length === 0) return null;
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const available = components.filter((component) => component.value !== null);
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  if (totalWeight <= 0 || availableWeight / totalWeight < minimumCoverage) return null;
  const score = available.reduce((sum, component) => {
    assertFinite(component.value as number, "component value");
    return sum + (component.value as number) * component.weight;
  }, 0) / availableWeight;
  return clampScore(score);
}

export function totalReturn(prices: number[]): number {
  if (prices.length < 2) throw new Error("totalReturn requires at least two prices");
  const first = prices[0];
  const last = prices.at(-1);
  if (first === undefined || last === undefined || first <= 0) throw new Error("prices must contain positive finite values");
  return (last / first - 1) * 100;
}

export function maxDrawdown(prices: number[]): number {
  if (prices.length === 0) throw new Error("maxDrawdown requires prices");
  let peak = prices[0];
  if (peak === undefined || peak <= 0) throw new Error("prices must be positive");
  let worst = 0;
  for (const price of prices) {
    if (!Number.isFinite(price) || price <= 0) throw new Error("prices must be positive and finite");
    peak = Math.max(peak, price);
    worst = Math.min(worst, (price / peak - 1) * 100);
  }
  return worst;
}

export function realizedVolatility(prices: number[], annualization = 252): number {
  if (prices.length < 3) throw new Error("realizedVolatility requires at least three prices");
  const logReturns = prices.slice(1).map((price, index) => {
    const previous = prices[index];
    if (previous === undefined || previous <= 0 || price <= 0) throw new Error("prices must be positive");
    return Math.log(price / previous);
  });
  return standardDeviation(logReturns) * Math.sqrt(annualization) * 100;
}

function scoreSide(value: number, band: number, previousPositive: boolean | undefined): boolean {
  if (value > band) return true;
  if (value < -band) return false;
  return previousPositive ?? (value >= 0);
}

export function classifyRegime({ supplyScore, monetizationScore, previousRegime, neutralBand = 10 }: RegimeInput): RegimeKey {
  assertFinite(supplyScore, "supplyScore");
  assertFinite(monetizationScore, "monetizationScore");
  const previousSupplyPositive = previousRegime === undefined ? undefined : previousRegime === "capex_expansion" || previousRegime === "bubble_divergence";
  const previousMonetizationPositive = previousRegime === undefined ? undefined : previousRegime === "capex_expansion" || previousRegime === "healthy_reset";
  const supplyPositive = scoreSide(supplyScore, neutralBand, previousSupplyPositive);
  const monetizationPositive = scoreSide(monetizationScore, neutralBand, previousMonetizationPositive);
  if (supplyPositive && monetizationPositive) return "capex_expansion";
  if (!supplyPositive && monetizationPositive) return "healthy_reset";
  if (supplyPositive && !monetizationPositive) return "bubble_divergence";
  return "capex_downturn";
}
