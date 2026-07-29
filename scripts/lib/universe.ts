export interface UniverseMember {
  symbol: string;
  name: string;
  basket: "supply" | "hyperscaler" | "reference";
  weight: number;
}

export const SUPPLY_PROXY = "SOXX";
export const NASDAQ_PROXY = "QQQ";
export const COPPER_PROXY = "CPER";

export const SUPPLY_BASKET: UniverseMember[] = [
  { symbol: "NVDA", name: "NVIDIA", basket: "supply", weight: 0.125 },
  { symbol: "AVGO", name: "Broadcom", basket: "supply", weight: 0.125 },
  { symbol: "AMD", name: "AMD", basket: "supply", weight: 0.125 },
  { symbol: "MU", name: "Micron", basket: "supply", weight: 0.125 },
  { symbol: "TSM", name: "TSMC ADR", basket: "supply", weight: 0.125 },
  { symbol: "ASML", name: "ASML ADR", basket: "supply", weight: 0.125 },
  { symbol: "AMAT", name: "Applied Materials", basket: "supply", weight: 0.125 },
  { symbol: "LRCX", name: "Lam Research", basket: "supply", weight: 0.125 },
];

export const HYPERSCALER_BASKET: UniverseMember[] = [
  { symbol: "MSFT", name: "Microsoft", basket: "hyperscaler", weight: 0.2 },
  { symbol: "AMZN", name: "Amazon", basket: "hyperscaler", weight: 0.2 },
  { symbol: "GOOGL", name: "Alphabet", basket: "hyperscaler", weight: 0.2 },
  { symbol: "META", name: "Meta", basket: "hyperscaler", weight: 0.2 },
  { symbol: "ORCL", name: "Oracle", basket: "hyperscaler", weight: 0.2 },
];

export const REFERENCE_BASKET: UniverseMember[] = [
  { symbol: "SOXX", name: "iShares Semiconductor ETF", basket: "reference", weight: 0 },
  { symbol: "QQQ", name: "Invesco QQQ", basket: "reference", weight: 0 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", basket: "reference", weight: 0 },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", basket: "reference", weight: 0 },
  { symbol: "CPER", name: "United States Copper Index Fund", basket: "reference", weight: 0 },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", basket: "reference", weight: 0 },
  { symbol: "HYG", name: "iShares High Yield Corporate Bond ETF", basket: "reference", weight: 0 },
  { symbol: "UUP", name: "Invesco DB US Dollar Index Bullish Fund", basket: "reference", weight: 0 },
];

export const MARKET_UNIVERSE: UniverseMember[] = [
  ...SUPPLY_BASKET,
  ...HYPERSCALER_BASKET,
  ...REFERENCE_BASKET,
];

export const MARKET_SYMBOLS = Array.from(new Set(MARKET_UNIVERSE.map((member) => member.symbol)));

export const FRED_SERIES = {
  realYield10y: "DFII10",
  investmentGradeOas: "BAMLC0A0CM",
  highYieldOas: "BAMLH0A0HYM2",
} as const;

export const FRED_SERIES_IDS = Object.values(FRED_SERIES);

export function memberBySymbol(symbol: string): UniverseMember | undefined {
  return MARKET_UNIVERSE.find((member) => member.symbol === symbol);
}
