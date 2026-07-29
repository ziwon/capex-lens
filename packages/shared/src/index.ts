export type RegimeKey =
  | "capex_expansion"
  | "healthy_reset"
  | "bubble_divergence"
  | "capex_downturn";

export type Signal = "positive" | "negative" | "neutral";
export type TrendDirection = "rising" | "falling" | "stable";

export const REGIME_META: Record<RegimeKey, { label: string; description: string }> = {
  capex_expansion: {
    label: "CAPEX Expansion",
    description: "AI infrastructure demand and hyperscaler economics are reinforcing each other.",
  },
  healthy_reset: {
    label: "Healthy Reset",
    description: "Supply-chain momentum is cooling while hyperscaler monetization remains resilient.",
  },
  bubble_divergence: {
    label: "Bubble Divergence",
    description: "Supplier momentum is outrunning the cash-flow evidence from infrastructure buyers.",
  },
  capex_downturn: {
    label: "CAPEX Downturn",
    description: "Supply-chain demand expectations and hyperscaler economics are weakening together.",
  },
};

export interface ScoreComponent {
  id: string;
  label: string;
  score: number;
  weight: number;
  sourceMetricIds: string[];
}

export interface AxisScore {
  key: "supply" | "monetization" | "macro";
  label: string;
  score: number;
  previousScore: number;
  trend: TrendDirection;
  summary: string;
  components: ScoreComponent[];
}

export interface Indicator {
  id: string;
  label: string;
  category: "Supply" | "Monetization" | "Macro";
  formattedValue: string;
  numericValue: number;
  change: number;
  changeLabel: string;
  signal: Signal;
  description: string;
  sourceId: string;
  availableAt: string;
}

export interface BasketMember {
  symbol: string;
  name: string;
  weight: number;
  return20d: number;
  return60d: number;
  drawdown: number;
}

export interface TrendPoint {
  date: string;
  supply: number;
  monetization: number;
  macro: number;
}

export interface EvidenceReport {
  period: string;
  headline: string;
  summary: string;
  primaryDrivers: string[];
  counterEvidence: string[];
  watchNext: string[];
  sourceMetricIds: string[];
  disclaimer: string;
}

export interface DashboardSnapshot {
  schemaVersion: 1;
  mode: "demo" | "live";
  asOf: string;
  generatedAt: string;
  freshness: string;
  coverage: number;
  regime: RegimeKey;
  confidence: number;
  divergenceScore: number;
  axes: {
    supply: AxisScore;
    monetization: AxisScore;
    macro: AxisScore;
  };
  indicators: Indicator[];
  trend: TrendPoint[];
  baskets: {
    supply: BasketMember[];
    hyperscalers: BasketMember[];
  };
  report: EvidenceReport;
}

export const demoSnapshot: DashboardSnapshot = {
  schemaVersion: 1,
  mode: "demo",
  asOf: "2026-07-29",
  generatedAt: "2026-07-29T23:30:00Z",
  freshness: "illustrative snapshot",
  coverage: 100,
  regime: "healthy_reset",
  confidence: 0.68,
  divergenceScore: -64,
  axes: {
    supply: {
      key: "supply",
      label: "Supply-chain momentum",
      score: -42,
      previousScore: -18,
      trend: "falling",
      summary: "Relative strength and breadth have weakened after an extended AI infrastructure run.",
      components: [
        { id: "supply-relative", label: "SOXX / QQQ relative strength", score: -61, weight: 0.25, sourceMetricIds: ["market.soxx_qqq.rs60"] },
        { id: "supply-drawdown", label: "52-week drawdown state", score: -46, weight: 0.2, sourceMetricIds: ["market.soxx.drawdown"] },
        { id: "supply-breadth", label: "Constituent breadth", score: -35, weight: 0.2, sourceMetricIds: ["market.supply.breadth50"] },
        { id: "supply-volatility", label: "Volatility and dispersion", score: -24, weight: 0.1, sourceMetricIds: ["market.supply.rv20"] }
      ]
    },
    monetization: {
      key: "monetization",
      label: "Monetization confidence",
      score: 22,
      previousScore: 16,
      trend: "rising",
      summary: "Customer equities are holding up better than suppliers, but this remains a market proxy.",
      components: [
        { id: "hyper-relative", label: "Hyperscaler / supply relative strength", score: 37, weight: 0.4, sourceMetricIds: ["market.hyper_supply.rs60"] },
        { id: "hyper-breadth", label: "Hyperscaler breadth", score: 24, weight: 0.2, sourceMetricIds: ["market.hyper.breadth50"] },
        { id: "credit-proxy", label: "Credit-risk proxy", score: 8, weight: 0.15, sourceMetricIds: ["macro.ig_oas", "macro.hy_oas"] },
        { id: "duration-pressure", label: "Long-duration rate pressure", score: -12, weight: 0.1, sourceMetricIds: ["macro.real_yield_10y"] }
      ]
    },
    macro: {
      key: "macro",
      label: "Macro conditions",
      score: -8,
      previousScore: -3,
      trend: "falling",
      summary: "Real yields remain restrictive while credit conditions are not yet signaling systemic stress.",
      components: [
        { id: "real-yield", label: "10-year real yield", score: -28, weight: 0.4, sourceMetricIds: ["macro.real_yield_10y"] },
        { id: "credit", label: "Credit spreads", score: 12, weight: 0.35, sourceMetricIds: ["macro.ig_oas", "macro.hy_oas"] },
        { id: "copper", label: "Copper trend", score: 8, weight: 0.25, sourceMetricIds: ["macro.copper.return20"] }
      ]
    }
  },
  indicators: [
    {
      id: "market.soxx_qqq.rs60",
      label: "SOXX / QQQ 60-day relative strength",
      category: "Supply",
      formattedValue: "-7.4 pp",
      numericValue: -7.4,
      change: -3.1,
      changeLabel: "-3.1 pp this week",
      signal: "negative",
      description: "Semiconductor momentum is weakening faster than the broader Nasdaq proxy.",
      sourceId: "demo.market",
      availableAt: "2026-07-29T21:15:00Z"
    },
    {
      id: "market.soxx.drawdown",
      label: "SOXX drawdown from 52-week high",
      category: "Supply",
      formattedValue: "-18.2%",
      numericValue: -18.2,
      change: -5.6,
      changeLabel: "-5.6 pp this week",
      signal: "negative",
      description: "A deeper drawdown indicates that the momentum unwind has moved beyond a routine pullback.",
      sourceId: "demo.market",
      availableAt: "2026-07-29T21:15:00Z"
    },
    {
      id: "market.hyper_supply.rs60",
      label: "Hyperscaler / supply 60-day strength",
      category: "Monetization",
      formattedValue: "+8.6 pp",
      numericValue: 8.6,
      change: 4.2,
      changeLabel: "+4.2 pp this week",
      signal: "positive",
      description: "Infrastructure buyers are outperforming suppliers, consistent with a valuation reset.",
      sourceId: "demo.market",
      availableAt: "2026-07-29T21:15:00Z"
    },
    {
      id: "macro.real_yield_10y",
      label: "US 10-year real yield",
      category: "Macro",
      formattedValue: "2.44%",
      numericValue: 2.44,
      change: 0.08,
      changeLabel: "+8 bps this week",
      signal: "negative",
      description: "A higher real discount rate pressures long-duration AI investment valuations.",
      sourceId: "demo.fred",
      availableAt: "2026-07-29T22:00:00Z"
    },
    {
      id: "macro.hy_oas",
      label: "High-yield option-adjusted spread",
      category: "Macro",
      formattedValue: "3.25%",
      numericValue: 3.25,
      change: 0.12,
      changeLabel: "+12 bps this week",
      signal: "neutral",
      description: "Spreads are drifting wider but remain below levels associated with broad credit stress.",
      sourceId: "demo.fred",
      availableAt: "2026-07-29T22:00:00Z"
    },
    {
      id: "macro.copper.return20",
      label: "Copper 20-day return",
      category: "Macro",
      formattedValue: "+2.8%",
      numericValue: 2.8,
      change: 1.4,
      changeLabel: "+1.4 pp this week",
      signal: "positive",
      description: "Firm copper prices are counter-evidence against an immediate global demand collapse.",
      sourceId: "demo.market",
      availableAt: "2026-07-29T21:15:00Z"
    }
  ],
  trend: [
    { date: "2026-05-13", supply: 28, monetization: 6, macro: 2 },
    { date: "2026-05-20", supply: 36, monetization: 3, macro: -4 },
    { date: "2026-05-27", supply: 48, monetization: -2, macro: -9 },
    { date: "2026-06-03", supply: 62, monetization: -6, macro: -12 },
    { date: "2026-06-10", supply: 71, monetization: -9, macro: -18 },
    { date: "2026-06-17", supply: 78, monetization: -4, macro: -12 },
    { date: "2026-06-24", supply: 81, monetization: 1, macro: -5 },
    { date: "2026-07-01", supply: 74, monetization: 8, macro: -3 },
    { date: "2026-07-08", supply: 52, monetization: 11, macro: -7 },
    { date: "2026-07-15", supply: 18, monetization: 14, macro: -2 },
    { date: "2026-07-22", supply: -18, monetization: 16, macro: -3 },
    { date: "2026-07-29", supply: -42, monetization: 22, macro: -8 }
  ],
  baskets: {
    supply: [
      { symbol: "NVDA", name: "NVIDIA", weight: 0.2, return20d: -11.8, return60d: 8.4, drawdown: -16.4 },
      { symbol: "AVGO", name: "Broadcom", weight: 0.16, return20d: -8.1, return60d: 12.7, drawdown: -13.1 },
      { symbol: "AMD", name: "AMD", weight: 0.13, return20d: -15.2, return60d: -2.8, drawdown: -21.5 },
      { symbol: "MU", name: "Micron", weight: 0.13, return20d: -17.4, return60d: 19.1, drawdown: -19.8 },
      { symbol: "TSM", name: "TSMC ADR", weight: 0.13, return20d: -6.6, return60d: 10.2, drawdown: -11.9 }
    ],
    hyperscalers: [
      { symbol: "MSFT", name: "Microsoft", weight: 0.23, return20d: 2.6, return60d: -1.8, drawdown: -8.4 },
      { symbol: "AMZN", name: "Amazon", weight: 0.22, return20d: 1.2, return60d: 4.1, drawdown: -7.2 },
      { symbol: "GOOGL", name: "Alphabet", weight: 0.21, return20d: 4.8, return60d: 7.6, drawdown: -5.9 },
      { symbol: "META", name: "Meta", weight: 0.2, return20d: 3.1, return60d: 2.4, drawdown: -7.8 },
      { symbol: "ORCL", name: "Oracle", weight: 0.14, return20d: -2.4, return60d: 3.2, drawdown: -12.3 }
    ]
  },
  report: {
    period: "2026-W31",
    headline: "The current pattern resembles a healthy reset, not yet a CAPEX downturn.",
    summary: "Supply-chain momentum has broken sharply, while hyperscaler equities and broad credit remain comparatively resilient. The regime is therefore classified as Healthy Reset, but confidence is limited because reported CAPEX-to-FCF fundamentals are not yet connected.",
    primaryDrivers: [
      "SOXX is underperforming QQQ across the medium horizon.",
      "Hyperscalers are outperforming the AI supply basket during the unwind.",
      "Supplier breadth and drawdown have deteriorated together."
    ],
    counterEvidence: [
      "Restrictive real yields continue to raise the hurdle rate for AI projects.",
      "High-yield spreads have widened modestly.",
      "The demo does not yet include reported hyperscaler CAPEX and free cash flow."
    ],
    watchNext: [
      "Hyperscaler CAPEX and operating-cash-flow guidance.",
      "Whether credit spreads confirm or reject the equity-market warning.",
      "Supply-chain breadth after the initial momentum liquidation."
    ],
    sourceMetricIds: [
      "market.soxx_qqq.rs60",
      "market.hyper_supply.rs60",
      "market.soxx.drawdown",
      "macro.real_yield_10y",
      "macro.hy_oas"
    ],
    disclaimer: "Illustrative research context only. Not a trading signal or investment advice."
  }
};
