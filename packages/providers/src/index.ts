export interface Provenance {
  provider: string;
  sourceId: string;
  sourceLocator: string;
  fetchedAt: string;
  availableAt: string;
  contentHash: string;
  schemaVersion: string;
  license: string;
}

export interface RawPayload {
  provider: string;
  sourceId: string;
  objectKey: string;
  sourceLocator: string;
  fetchedAt: string;
  contentType: "application/json" | "text/csv" | "text/plain";
  contentHash: string;
  schemaVersion: string;
  license: string;
  body: string;
}

export type RawPayloadSink = (payload: RawPayload) => Promise<void> | void;

export interface DailyBar {
  symbol: string;
  sessionDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
  currency: string;
  provenance: Provenance;
}

export interface MacroObservation {
  seriesId: string;
  observationDate: string;
  value: number;
  unit: string;
  provenance: Provenance;
}

export interface FundamentalObservation {
  companyId: string;
  metricId: string;
  fiscalPeriod: string;
  observationDate: string;
  value: number;
  unit: string;
  accessionNumber?: string;
  provenance: Provenance;
}

export interface MarketDataProvider {
  readonly id: string;
  getDailyBars(symbols: string[], from: string, to: string): Promise<DailyBar[]>;
}

export interface MacroDataProvider {
  readonly id: string;
  getSeries(seriesIds: string[], from: string, to: string): Promise<MacroObservation[]>;
}

export interface FundamentalsProvider {
  readonly id: string;
  getCompanyFacts(companyIds: string[], since: string): Promise<FundamentalObservation[]>;
}

export { FredProvider, type FredProviderOptions } from "./fred";
export { TwelveDataProvider, type TwelveDataProviderOptions } from "./twelve-data";
