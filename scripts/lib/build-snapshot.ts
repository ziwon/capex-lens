import {
  classifyRegime,
  clampScore,
  currentDrawdown,
  mean,
  movingAverage,
  realizedVolatility,
  robustZScore,
  scoreFromZ,
  standardDeviation,
  totalReturn,
  trendDirection,
  weightedScore,
} from "@capex-lens/indicators";
import type { DailyBar, MacroObservation } from "@capex-lens/providers";
import {
  REGIME_META,
  type AxisScore,
  type BasketMember,
  type DashboardSnapshot,
  type Indicator,
  type RegimeKey,
  type ScoreComponent,
  type Signal,
  type TrendPoint,
} from "@capex-lens/shared";
import {
  COPPER_PROXY,
  FRED_SERIES,
  HYPERSCALER_BASKET,
  MARKET_SYMBOLS,
  NASDAQ_PROXY,
  SUPPLY_BASKET,
  SUPPLY_PROXY,
  type UniverseMember,
} from "./universe";

type BarsBySymbol = Map<string, DailyBar[]>;
type MacroBySeries = Map<string, MacroObservation[]>;

type MetricKey =
  | "supplyRelative60"
  | "supplyBreadth50"
  | "supplyDrawdown"
  | "supplyMomentum"
  | "supplyRisk"
  | "hyperRelative60"
  | "hyperBreadth50"
  | "hyperDrawdownResilience"
  | "creditRisk"
  | "durationPressure"
  | "copper20";

interface RawMetrics {
  date: string;
  supplyRelative60: number | null;
  supplyBreadth50: number | null;
  supplyDrawdown: number | null;
  supplyMomentum: number | null;
  supplyRisk: number | null;
  hyperRelative60: number | null;
  hyperBreadth50: number | null;
  hyperDrawdownResilience: number | null;
  creditRisk: number | null;
  durationPressure: number | null;
  copper20: number | null;
  realYieldLevel: number | null;
  igOasLevel: number | null;
  hyOasLevel: number | null;
}

interface ScoredRow {
  date: string;
  regime: RegimeKey;
  supplyScore: number;
  monetizationScore: number;
  macroScore: number;
  supplyComponents: ScoreComponent[];
  monetizationComponents: ScoreComponent[];
  macroComponents: ScoreComponent[];
}

interface ComponentSpec {
  id: string;
  label: string;
  key: MetricKey;
  weight: number;
  sourceMetricIds: string[];
}

const SUPPLY_COMPONENTS: ComponentSpec[] = [
  { id: "supply-relative", label: "SOXX / QQQ relative strength", key: "supplyRelative60", weight: 0.25, sourceMetricIds: ["market.soxx_qqq.rs60"] },
  { id: "supply-breadth", label: "Constituent breadth", key: "supplyBreadth50", weight: 0.2, sourceMetricIds: ["market.supply.breadth50"] },
  { id: "supply-drawdown", label: "52-week drawdown state", key: "supplyDrawdown", weight: 0.2, sourceMetricIds: ["market.soxx.drawdown"] },
  { id: "supply-momentum", label: "Multi-horizon momentum", key: "supplyMomentum", weight: 0.15, sourceMetricIds: ["market.soxx.return20", "market.soxx.return60", "market.soxx.return120"] },
  { id: "supply-risk", label: "Volatility and dispersion", key: "supplyRisk", weight: 0.1, sourceMetricIds: ["market.supply.rv20", "market.supply.dispersion20"] },
];

const MONETIZATION_COMPONENTS: ComponentSpec[] = [
  { id: "hyper-relative", label: "Hyperscaler / supply relative strength", key: "hyperRelative60", weight: 0.4, sourceMetricIds: ["market.hyper_supply.rs60"] },
  { id: "hyper-breadth", label: "Hyperscaler breadth", key: "hyperBreadth50", weight: 0.2, sourceMetricIds: ["market.hyper.breadth50"] },
  { id: "hyper-resilience", label: "Hyperscaler drawdown resilience", key: "hyperDrawdownResilience", weight: 0.15, sourceMetricIds: ["market.hyper.drawdown_resilience"] },
  { id: "credit-proxy", label: "Credit-risk proxy", key: "creditRisk", weight: 0.15, sourceMetricIds: ["macro.ig_oas", "macro.hy_oas"] },
  { id: "duration-pressure", label: "Long-duration rate pressure", key: "durationPressure", weight: 0.1, sourceMetricIds: ["macro.real_yield_10y"] },
];

const MACRO_COMPONENTS: ComponentSpec[] = [
  { id: "real-yield", label: "10-year real yield", key: "durationPressure", weight: 0.4, sourceMetricIds: ["macro.real_yield_10y"] },
  { id: "credit", label: "Credit spreads", key: "creditRisk", weight: 0.35, sourceMetricIds: ["macro.ig_oas", "macro.hy_oas"] },
  { id: "copper", label: "Copper trend", key: "copper20", weight: 0.25, sourceMetricIds: ["macro.copper.return20"] },
];

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function upperBound<T>(values: T[], predicate: (value: T) => boolean): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const value = values[middle];
    if (value !== undefined && predicate(value)) low = middle + 1;
    else high = middle;
  }
  return low;
}

function barsThrough(series: DailyBar[] | undefined, date: string): DailyBar[] {
  if (series === undefined) return [];
  return series.slice(0, upperBound(series, (bar) => bar.sessionDate <= date));
}

function pricesThrough(series: DailyBar[] | undefined, date: string): number[] {
  return barsThrough(series, date).map((bar) => bar.adjustedClose);
}

function returnAt(series: DailyBar[] | undefined, date: string, tradingDays: number): number | null {
  const prices = pricesThrough(series, date);
  if (prices.length < tradingDays + 1) return null;
  return totalReturn(prices.slice(-(tradingDays + 1)));
}

function drawdownAt(series: DailyBar[] | undefined, date: string, lookback = 252): number | null {
  const prices = pricesThrough(series, date);
  if (prices.length < Math.min(60, lookback)) return null;
  return currentDrawdown(prices, lookback);
}

function volatilityAt(series: DailyBar[] | undefined, date: string, tradingDays = 20): number | null {
  const prices = pricesThrough(series, date);
  if (prices.length < tradingDays + 1) return null;
  return realizedVolatility(prices.slice(-(tradingDays + 1)));
}

function latestMacro(series: MacroObservation[] | undefined, date: string): MacroObservation | null {
  if (series === undefined) return null;
  const index = upperBound(series, (observation) => observation.observationDate <= date) - 1;
  return index >= 0 ? series[index] ?? null : null;
}

function weightedAvailable(values: Array<{ value: number | null; weight: number }>, minimumCoverage = 0.7): number | null {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  const available = values.filter((entry) => entry.value !== null);
  const availableWeight = available.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0 || availableWeight / totalWeight < minimumCoverage) return null;
  return available.reduce((sum, entry) => sum + (entry.value as number) * entry.weight, 0) / availableWeight;
}

function basketReturn(bars: BarsBySymbol, members: UniverseMember[], date: string, tradingDays: number): number | null {
  return weightedAvailable(members.map((member) => ({ value: returnAt(bars.get(member.symbol), date, tradingDays), weight: member.weight })));
}

function basketDrawdown(bars: BarsBySymbol, members: UniverseMember[], date: string): number | null {
  return weightedAvailable(members.map((member) => ({ value: drawdownAt(bars.get(member.symbol), date), weight: member.weight })));
}

function basketBreadth(bars: BarsBySymbol, members: UniverseMember[], date: string, period = 50): number | null {
  const results: Array<number | null> = members.map((member) => {
    const prices = pricesThrough(bars.get(member.symbol), date);
    if (prices.length < period) return null;
    const latest = prices.at(-1);
    if (latest === undefined) return null;
    return latest > movingAverage(prices, period) ? 1 : 0;
  });
  const available = results.filter((value): value is number => value !== null);
  if (available.length / members.length < 0.7) return null;
  return mean(available);
}

function basketDispersion(bars: BarsBySymbol, members: UniverseMember[], date: string, tradingDays = 20): number | null {
  const returns = members.map((member) => returnAt(bars.get(member.symbol), date, tradingDays)).filter((value): value is number => value !== null);
  if (returns.length / members.length < 0.7 || returns.length < 2) return null;
  return standardDeviation(returns);
}

function groupBars(input: DailyBar[]): BarsBySymbol {
  const result = new Map<string, DailyBar[]>();
  for (const bar of input) {
    const values = result.get(bar.symbol) ?? [];
    values.push(bar);
    result.set(bar.symbol, values);
  }
  for (const values of result.values()) values.sort((left, right) => left.sessionDate.localeCompare(right.sessionDate));
  return result;
}

function groupMacro(input: MacroObservation[]): MacroBySeries {
  const result = new Map<string, MacroObservation[]>();
  for (const observation of input) {
    const values = result.get(observation.seriesId) ?? [];
    values.push(observation);
    result.set(observation.seriesId, values);
  }
  for (const values of result.values()) values.sort((left, right) => left.observationDate.localeCompare(right.observationDate));
  return result;
}

function computeRawMetrics(date: string, bars: BarsBySymbol, macro: MacroBySeries): RawMetrics {
  const supplyReturn20 = returnAt(bars.get(SUPPLY_PROXY), date, 20);
  const supplyReturn60 = returnAt(bars.get(SUPPLY_PROXY), date, 60);
  const supplyReturn120 = returnAt(bars.get(SUPPLY_PROXY), date, 120);
  const qqqReturn60 = returnAt(bars.get(NASDAQ_PROXY), date, 60);
  const supplyBasketReturn60 = basketReturn(bars, SUPPLY_BASKET, date, 60);
  const hyperReturn60 = basketReturn(bars, HYPERSCALER_BASKET, date, 60);
  const supplyDrawdown = drawdownAt(bars.get(SUPPLY_PROXY), date);
  const hyperDrawdown = basketDrawdown(bars, HYPERSCALER_BASKET, date);
  const supplyBasketDrawdown = basketDrawdown(bars, SUPPLY_BASKET, date);
  const rv20 = volatilityAt(bars.get(SUPPLY_PROXY), date, 20);
  const dispersion20 = basketDispersion(bars, SUPPLY_BASKET, date, 20);
  const realYield = latestMacro(macro.get(FRED_SERIES.realYield10y), date)?.value ?? null;
  const igOas = latestMacro(macro.get(FRED_SERIES.investmentGradeOas), date)?.value ?? null;
  const hyOas = latestMacro(macro.get(FRED_SERIES.highYieldOas), date)?.value ?? null;

  const momentumValues = [supplyReturn20, supplyReturn60, supplyReturn120].filter((value): value is number => value !== null);
  return {
    date,
    supplyRelative60: supplyReturn60 === null || qqqReturn60 === null ? null : supplyReturn60 - qqqReturn60,
    supplyBreadth50: basketBreadth(bars, SUPPLY_BASKET, date),
    supplyDrawdown,
    supplyMomentum: momentumValues.length === 3 ? mean(momentumValues) : null,
    supplyRisk: rv20 === null || dispersion20 === null ? null : -(rv20 + dispersion20),
    hyperRelative60: hyperReturn60 === null || supplyBasketReturn60 === null ? null : hyperReturn60 - supplyBasketReturn60,
    hyperBreadth50: basketBreadth(bars, HYPERSCALER_BASKET, date),
    hyperDrawdownResilience: hyperDrawdown === null || supplyBasketDrawdown === null ? null : hyperDrawdown - supplyBasketDrawdown,
    creditRisk: igOas === null || hyOas === null ? null : -(igOas * 0.4 + hyOas * 0.6),
    durationPressure: realYield === null ? null : -realYield,
    copper20: returnAt(bars.get(COPPER_PROXY), date, 20),
    realYieldLevel: realYield,
    igOasLevel: igOas,
    hyOasLevel: hyOas,
  };
}

function scoreComponent(rows: RawMetrics[], index: number, spec: ComponentSpec): ScoreComponent | null {
  const current = rows[index]?.[spec.key];
  if (current === null || current === undefined) return null;
  const history = rows.slice(Math.max(0, index - 252), index).map((row) => row[spec.key]).filter((value): value is number => value !== null);
  const score = scoreFromZ(robustZScore(current, history));
  if (score === null) return null;
  return { id: spec.id, label: spec.label, score, weight: spec.weight, sourceMetricIds: spec.sourceMetricIds };
}

function scoreAxis(rows: RawMetrics[], index: number, specs: ComponentSpec[], omittedWeight = 0): { score: number; components: ScoreComponent[] } | null {
  const components = specs.map((spec) => scoreComponent(rows, index, spec)).filter((value): value is ScoreComponent => value !== null);
  const weighted = weightedScore([
    ...components.map((component) => ({ value: component.score, weight: component.weight })),
    ...(omittedWeight > 0 ? [{ value: null, weight: omittedWeight }] : []),
  ]);
  return weighted === null ? null : { score: weighted, components };
}

function scoreRow(rows: RawMetrics[], index: number, previousRegime?: RegimeKey): ScoredRow | null {
  const supply = scoreAxis(rows, index, SUPPLY_COMPONENTS, 0.1);
  const monetization = scoreAxis(rows, index, MONETIZATION_COMPONENTS);
  const macro = scoreAxis(rows, index, MACRO_COMPONENTS);
  const row = rows[index];
  if (row === undefined || supply === null || monetization === null || macro === null) return null;
  const regimeInput = previousRegime === undefined
    ? { supplyScore: supply.score, monetizationScore: monetization.score }
    : { supplyScore: supply.score, monetizationScore: monetization.score, previousRegime };
  return {
    date: row.date,
    regime: classifyRegime(regimeInput),
    supplyScore: supply.score,
    monetizationScore: monetization.score,
    macroScore: macro.score,
    supplyComponents: supply.components,
    monetizationComponents: monetization.components,
    macroComponents: macro.components,
  };
}

function maximumAvailableAt(values: Array<DailyBar | MacroObservation | null>): string {
  const timestamps = values.filter((value): value is DailyBar | MacroObservation => value !== null).map((value) => value.provenance.availableAt);
  return timestamps.sort().at(-1) ?? new Date(0).toISOString();
}

function latestBar(bars: BarsBySymbol, symbol: string, date: string): DailyBar | null {
  return barsThrough(bars.get(symbol), date).at(-1) ?? null;
}

function formatSigned(value: number, suffix = "%"): string {
  return `${value > 0 ? "+" : ""}${round(value, 1).toFixed(1)}${suffix}`;
}

function signalFor(value: number, positiveThreshold = 0, negativeThreshold = 0): Signal {
  if (value > positiveThreshold) return "positive";
  if (value < negativeThreshold) return "negative";
  return "neutral";
}

function indicator(input: Omit<Indicator, "changeLabel"> & { changeLabel?: string }): Indicator {
  return { ...input, changeLabel: input.changeLabel ?? `${formatSigned(input.change, " pp")} over five sessions` };
}

function basketMembers(bars: BarsBySymbol, members: UniverseMember[], date: string): BasketMember[] {
  return members.map((member) => ({
    symbol: member.symbol,
    name: member.name,
    weight: member.weight,
    return20d: round(returnAt(bars.get(member.symbol), date, 20) ?? 0, 1),
    return60d: round(returnAt(bars.get(member.symbol), date, 60) ?? 0, 1),
    drawdown: round(drawdownAt(bars.get(member.symbol), date) ?? 0, 1),
  }));
}

function isoWeek(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function axisSummary(key: "supply" | "monetization" | "macro", score: number): string {
  if (key === "supply") return score >= 0
    ? "AI infrastructure equities retain positive relative momentum and breadth."
    : "AI infrastructure momentum is unwinding across relative strength, breadth, or drawdown measures.";
  if (key === "monetization") return score >= 0
    ? "Hyperscaler equities remain comparatively resilient; this is still a market-implied monetization proxy."
    : "Customer-equity resilience, credit, or duration conditions are failing to validate the supply-chain build-out.";
  return score >= 0
    ? "Macro and credit conditions remain broadly supportive of risk assets."
    : "Real yields, credit spreads, or cyclical proxies are creating a restrictive macro backdrop.";
}

function axisScore(key: "supply" | "monetization" | "macro", label: string, current: number, previous: number, components: ScoreComponent[]): AxisScore {
  return {
    key,
    label,
    score: current,
    previousScore: previous,
    trend: trendDirection(current, previous),
    summary: axisSummary(key, current),
    components,
  };
}

export function buildLiveSnapshot(inputBars: DailyBar[], inputMacro: MacroObservation[], generatedAt = new Date().toISOString()): DashboardSnapshot {
  const bars = groupBars(inputBars.filter((bar) => bar.provenance.availableAt <= generatedAt));
  const macro = groupMacro(inputMacro.filter((observation) => observation.provenance.availableAt <= generatedAt));
  const proxyBars = bars.get(SUPPLY_PROXY) ?? [];
  if (proxyBars.length < 260) throw new Error(`Live snapshot requires at least 260 ${SUPPLY_PROXY} sessions; received ${proxyBars.length}`);
  const asOf = proxyBars.at(-1)?.sessionDate;
  if (asOf === undefined) throw new Error("No market as-of date is available");

  const marketCoverage = MARKET_SYMBOLS.filter((symbol) => latestBar(bars, symbol, asOf)?.sessionDate === asOf).length / MARKET_SYMBOLS.length;
  if (marketCoverage < 0.7) throw new Error(`Market coverage ${round(marketCoverage * 100, 1)}% is below the 70% publication gate`);
  const macroCoverage = Object.values(FRED_SERIES).filter((seriesId) => latestMacro(macro.get(seriesId), asOf) !== null).length / Object.values(FRED_SERIES).length;
  const coverage = round((marketCoverage * 0.8 + macroCoverage * 0.2) * 100, 1);

  const dates = proxyBars.map((bar) => bar.sessionDate);
  const rawRows = dates.map((date) => computeRawMetrics(date, bars, macro));
  const currentIndex = rawRows.length - 1;
  const current = scoreRow(rawRows, currentIndex);
  if (current === null) throw new Error("Insufficient history to calculate live regime scores");

  const selectedIndices = Array.from({ length: 12 }, (_, offset) => currentIndex - (11 - offset) * 5).filter((index) => index >= 0);
  const trend: TrendPoint[] = [];
  let previousRegime: RegimeKey | undefined;
  const scoredTrend: ScoredRow[] = [];
  for (const index of selectedIndices) {
    const scored = scoreRow(rawRows, index, previousRegime);
    if (scored === null) continue;
    previousRegime = scored.regime;
    scoredTrend.push(scored);
    trend.push({ date: scored.date, supply: scored.supplyScore, monetization: scored.monetizationScore, macro: scored.macroScore });
  }
  const previous = scoredTrend.at(-2) ?? current;
  const raw = rawRows[currentIndex];
  const previousRaw = rawRows[Math.max(0, currentIndex - 5)];
  if (raw === undefined || previousRaw === undefined) throw new Error("Raw metric history invariant failed");

  const realYieldObservation = latestMacro(macro.get(FRED_SERIES.realYield10y), asOf);
  const igObservation = latestMacro(macro.get(FRED_SERIES.investmentGradeOas), asOf);
  const hyObservation = latestMacro(macro.get(FRED_SERIES.highYieldOas), asOf);
  const marketAvailableAt = maximumAvailableAt([latestBar(bars, SUPPLY_PROXY, asOf), latestBar(bars, NASDAQ_PROXY, asOf), latestBar(bars, COPPER_PROXY, asOf)]);
  const macroAvailableAt = maximumAvailableAt([realYieldObservation, igObservation, hyObservation]);

  const indicators: Indicator[] = [
    indicator({
      id: "market.soxx_qqq.rs60",
      label: "SOXX / QQQ 60-day relative strength",
      category: "Supply",
      formattedValue: formatSigned(raw.supplyRelative60 ?? 0, " pp"),
      numericValue: round(raw.supplyRelative60 ?? 0),
      change: round((raw.supplyRelative60 ?? 0) - (previousRaw.supplyRelative60 ?? 0)),
      signal: signalFor(raw.supplyRelative60 ?? 0),
      description: "Semiconductor total-return momentum relative to the Nasdaq proxy.",
      sourceId: "twelve-data.adjusted-daily",
      availableAt: marketAvailableAt,
    }),
    indicator({
      id: "market.soxx.drawdown",
      label: "SOXX drawdown from 52-week high",
      category: "Supply",
      formattedValue: formatSigned(raw.supplyDrawdown ?? 0),
      numericValue: round(raw.supplyDrawdown ?? 0),
      change: round((raw.supplyDrawdown ?? 0) - (previousRaw.supplyDrawdown ?? 0)),
      signal: (raw.supplyDrawdown ?? 0) < -10 ? "negative" : "neutral",
      description: "Current adjusted close relative to the highest close in the trailing 252 sessions.",
      sourceId: "twelve-data.adjusted-daily",
      availableAt: marketAvailableAt,
    }),
    indicator({
      id: "market.supply.breadth50",
      label: "Supply basket above 50-day average",
      category: "Supply",
      formattedValue: `${round((raw.supplyBreadth50 ?? 0) * 100, 0)}%`,
      numericValue: round((raw.supplyBreadth50 ?? 0) * 100),
      change: round(((raw.supplyBreadth50 ?? 0) - (previousRaw.supplyBreadth50 ?? 0)) * 100),
      signal: signalFor((raw.supplyBreadth50 ?? 0) - 0.5, 0.1, -0.1),
      description: "Share of the configured AI supply-chain basket trading above its 50-day average.",
      sourceId: "twelve-data.adjusted-daily",
      availableAt: marketAvailableAt,
    }),
    indicator({
      id: "market.hyper_supply.rs60",
      label: "Hyperscaler / supply 60-day strength",
      category: "Monetization",
      formattedValue: formatSigned(raw.hyperRelative60 ?? 0, " pp"),
      numericValue: round(raw.hyperRelative60 ?? 0),
      change: round((raw.hyperRelative60 ?? 0) - (previousRaw.hyperRelative60 ?? 0)),
      signal: signalFor(raw.hyperRelative60 ?? 0),
      description: "Equal-weight hyperscaler return minus equal-weight AI supply-chain return.",
      sourceId: "twelve-data.adjusted-daily",
      availableAt: marketAvailableAt,
    }),
    indicator({
      id: "macro.real_yield_10y",
      label: "US 10-year real yield",
      category: "Macro",
      formattedValue: `${round(raw.realYieldLevel ?? 0, 2).toFixed(2)}%`,
      numericValue: round(raw.realYieldLevel ?? 0),
      change: round((raw.realYieldLevel ?? 0) - (previousRaw.realYieldLevel ?? 0)),
      changeLabel: `${formatSigned(((raw.realYieldLevel ?? 0) - (previousRaw.realYieldLevel ?? 0)) * 100, " bps")} over five sessions`,
      signal: (raw.realYieldLevel ?? 0) > 2 ? "negative" : "neutral",
      description: "A higher real discount rate pressures long-duration AI infrastructure valuations.",
      sourceId: `fred.${FRED_SERIES.realYield10y}`,
      availableAt: realYieldObservation?.provenance.availableAt ?? macroAvailableAt,
    }),
    indicator({
      id: "macro.hy_oas",
      label: "High-yield option-adjusted spread",
      category: "Macro",
      formattedValue: `${round(raw.hyOasLevel ?? 0, 2).toFixed(2)}%`,
      numericValue: round(raw.hyOasLevel ?? 0),
      change: round((raw.hyOasLevel ?? 0) - (previousRaw.hyOasLevel ?? 0)),
      changeLabel: `${formatSigned(((raw.hyOasLevel ?? 0) - (previousRaw.hyOasLevel ?? 0)) * 100, " bps")} over five sessions`,
      signal: (raw.hyOasLevel ?? 0) > 4 ? "negative" : (raw.hyOasLevel ?? 0) < 3 ? "positive" : "neutral",
      description: "Credit widening is an early warning that financing costs may reinforce an AI CAPEX slowdown.",
      sourceId: `fred.${FRED_SERIES.highYieldOas}`,
      availableAt: hyObservation?.provenance.availableAt ?? macroAvailableAt,
    }),
    indicator({
      id: "macro.copper.return20",
      label: "Copper proxy 20-day return",
      category: "Macro",
      formattedValue: formatSigned(raw.copper20 ?? 0),
      numericValue: round(raw.copper20 ?? 0),
      change: round((raw.copper20 ?? 0) - (previousRaw.copper20 ?? 0)),
      signal: signalFor(raw.copper20 ?? 0),
      description: "CPER is used as a documented, tradable copper proxy rather than a direct futures settlement series.",
      sourceId: "twelve-data.adjusted-daily",
      availableAt: latestBar(bars, COPPER_PROXY, asOf)?.provenance.availableAt ?? marketAvailableAt,
    }),
  ];

  const componentScores = [...current.supplyComponents, ...current.monetizationComponents];
  const agreement = componentScores.length === 0 ? 0 : componentScores.filter((component) => {
    const axis = current.supplyComponents.includes(component) ? current.supplyScore : current.monetizationScore;
    return Math.abs(component.score) < 10 || Math.sign(component.score) === Math.sign(axis);
  }).length / componentScores.length;
  const boundaryDistance = Math.min(1, (Math.abs(current.supplyScore) + Math.abs(current.monetizationScore)) / 120);
  const confidence = round(Math.min(0.75, 0.15 + coverage / 100 * 0.35 + agreement * 0.15 + boundaryDistance * 0.2), 2);

  const sourceMetricIds = indicators.map((value) => value.id);
  const regimeMeta = REGIME_META[current.regime];
  const negativeEvidence = indicators.filter((value) => value.signal === "negative").slice(0, 3).map((value) => `${value.label}: ${value.formattedValue}`);
  const positiveEvidence = indicators.filter((value) => value.signal === "positive").slice(0, 3).map((value) => `${value.label}: ${value.formattedValue}`);

  return {
    schemaVersion: 1,
    mode: "live",
    asOf,
    generatedAt,
    freshness: `Market through ${asOf}; FRED observations use conservative estimated availability timestamps`,
    coverage,
    regime: current.regime,
    confidence,
    divergenceScore: clampScore(current.supplyScore - current.monetizationScore),
    axes: {
      supply: axisScore("supply", "Supply-chain momentum", current.supplyScore, previous.supplyScore, current.supplyComponents),
      monetization: axisScore("monetization", "Market-implied monetization", current.monetizationScore, previous.monetizationScore, current.monetizationComponents),
      macro: axisScore("macro", "Macro conditions", current.macroScore, previous.macroScore, current.macroComponents),
    },
    indicators,
    trend,
    baskets: {
      supply: basketMembers(bars, SUPPLY_BASKET, asOf),
      hyperscalers: basketMembers(bars, HYPERSCALER_BASKET, asOf),
    },
    report: {
      period: isoWeek(asOf),
      headline: `${regimeMeta.label}: ${regimeMeta.description}`,
      summary: "The live MVP classifies the market using adjusted daily prices and FRED macro series. The monetization axis remains a market-implied proxy until SEC and investor-relations fundamentals are connected.",
      primaryDrivers: negativeEvidence.length > 0 ? negativeEvidence : ["No strongly negative primary driver crossed the current rule thresholds."],
      counterEvidence: positiveEvidence.length > 0 ? positiveEvidence : ["No strongly positive counter-evidence crossed the current rule thresholds."],
      watchNext: [
        "Hyperscaler earnings, CAPEX guidance, and free-cash-flow conversion",
        "Whether SOXX relative strength and constituent breadth stabilize together",
        "Real-yield and credit-spread confirmation before treating the move as systemic",
      ],
      sourceMetricIds,
      disclaimer: "Research dashboard only. This market-proxy regime is not a trading signal or investment advice.",
    },
  };
}
