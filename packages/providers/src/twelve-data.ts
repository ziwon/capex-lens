import { sha256Hex } from "./crypto";
import type { DailyBar, MarketDataProvider, RawPayloadSink } from "./index";

const BASE_URL = "https://api.twelvedata.com/time_series";
const LICENSE = "Twelve Data Basic plan — internal non-display use; review display rights before public release";

interface TwelveDataMeta {
  symbol?: string;
  currency?: string;
  exchange_timezone?: string;
  interval?: string;
}

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TwelveDataSeriesPayload {
  meta?: TwelveDataMeta;
  values?: TwelveDataValue[];
  status?: string;
  code?: number;
  message?: string;
}

export interface TwelveDataProviderOptions {
  apiKey: string;
  creditsPerMinute?: number;
  requestWindowMs?: number;
  fetchImpl?: typeof fetch;
  rawSink?: RawPayloadSink;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function asFiniteNumber(value: string | undefined, field: string, symbol: string, date: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Twelve Data returned invalid ${field} for ${symbol} on ${date}`);
  return parsed;
}

function isSeriesPayload(value: unknown): value is TwelveDataSeriesPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.values) || typeof candidate.status === "string" || typeof candidate.message === "string";
}

function extractSeries(payload: unknown, requestedSymbols: string[]): Array<[string, TwelveDataSeriesPayload]> {
  if (isSeriesPayload(payload)) {
    const symbol = payload.meta?.symbol ?? requestedSymbols[0];
    if (symbol === undefined) throw new Error("Twelve Data response did not identify a symbol");
    return [[symbol.toUpperCase(), payload]];
  }

  if (typeof payload !== "object" || payload === null) throw new Error("Twelve Data returned an invalid response");
  const root = payload as Record<string, unknown>;
  const data = typeof root.data === "object" && root.data !== null ? root.data as Record<string, unknown> : root;

  return requestedSymbols.map((symbol) => {
    const value = data[symbol] ?? data[symbol.toUpperCase()] ?? data[symbol.toLowerCase()];
    if (!isSeriesPayload(value)) throw new Error(`Twelve Data batch response is missing ${symbol}`);
    return [symbol.toUpperCase(), value];
  });
}

function marketAvailableAt(sessionDate: string, exchangeTimezone: string | undefined): string {
  if (exchangeTimezone?.includes("New_York")) return `${sessionDate}T22:00:00Z`;
  return `${sessionDate}T23:59:59Z`;
}

function safeObjectKeyPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function sleep(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class TwelveDataProvider implements MarketDataProvider {
  readonly id = "twelve-data";
  private readonly apiKey: string;
  private readonly creditsPerMinute: number;
  private readonly requestWindowMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly rawSink: RawPayloadSink | null;

  constructor(options: TwelveDataProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("Twelve Data API key is required");
    this.apiKey = options.apiKey;
    this.creditsPerMinute = Math.max(1, Math.floor(options.creditsPerMinute ?? 8));
    this.requestWindowMs = Math.max(0, options.requestWindowMs ?? 61_000);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.rawSink = options.rawSink ?? null;
  }

  async getDailyBars(symbols: string[], from: string, to: string): Promise<DailyBar[]> {
    const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
    if (uniqueSymbols.length === 0) return [];

    const batches = chunk(uniqueSymbols, this.creditsPerMinute);
    const bars: DailyBar[] = [];

    for (const [batchIndex, batch] of batches.entries()) {
      if (batchIndex > 0) await sleep(this.requestWindowMs);

      const fetchedAt = new Date().toISOString();
      const url = new URL(BASE_URL);
      url.searchParams.set("symbol", batch.join(","));
      url.searchParams.set("interval", "1day");
      url.searchParams.set("start_date", from);
      url.searchParams.set("end_date", to);
      url.searchParams.set("order", "ASC");
      url.searchParams.set("adjust", "all");
      url.searchParams.set("outputsize", "5000");
      url.searchParams.set("format", "JSON");
      url.searchParams.set("apikey", this.apiKey);

      const response = await this.fetchImpl(url, { headers: { accept: "application/json" } });
      const body = await response.text();
      if (!response.ok) throw new Error(`Twelve Data request failed (${response.status}): ${body.slice(0, 300)}`);

      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch (error) {
        throw new Error(`Twelve Data returned malformed JSON: ${String(error)}`);
      }

      const contentHash = await sha256Hex(body);
      const sanitizedUrl = new URL(url);
      sanitizedUrl.searchParams.delete("apikey");
      const sourceLocator = sanitizedUrl.toString();
      const objectKey = `market/twelve-data/${to}/batch-${String(batchIndex + 1).padStart(2, "0")}-${safeObjectKeyPart(batch.join("-"))}.json`;

      if (this.rawSink !== null) {
        await this.rawSink({
          provider: this.id,
          sourceId: "twelve-data.adjusted-daily",
          objectKey,
          sourceLocator,
          fetchedAt,
          contentType: "application/json",
          contentHash,
          schemaVersion: "twelve-data.time-series.v1",
          license: LICENSE,
          body,
        });
      }

      for (const [requestedSymbol, series] of extractSeries(payload, batch)) {
        if (series.status === "error") throw new Error(`Twelve Data error for ${requestedSymbol}: ${series.message ?? "unknown error"}`);
        if (!Array.isArray(series.values)) throw new Error(`Twelve Data returned no daily values for ${requestedSymbol}`);

        const symbol = (series.meta?.symbol ?? requestedSymbol).toUpperCase();
        const currency = series.meta?.currency ?? "USD";
        for (const value of series.values) {
          const open = asFiniteNumber(value.open, "open", symbol, value.datetime);
          const high = asFiniteNumber(value.high, "high", symbol, value.datetime);
          const low = asFiniteNumber(value.low, "low", symbol, value.datetime);
          const close = asFiniteNumber(value.close, "close", symbol, value.datetime);
          const volume = value.volume === undefined ? 0 : asFiniteNumber(value.volume, "volume", symbol, value.datetime);
          if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
            throw new Error(`Twelve Data returned non-positive OHLC or negative volume for ${symbol} on ${value.datetime}`);
          }

          const availableAt = marketAvailableAt(value.datetime, series.meta?.exchange_timezone);
          bars.push({
            symbol,
            sessionDate: value.datetime,
            open,
            high,
            low,
            close,
            adjustedClose: close,
            volume,
            currency,
            provenance: {
              provider: this.id,
              sourceId: "twelve-data.adjusted-daily",
              sourceLocator,
              fetchedAt,
              availableAt,
              contentHash,
              schemaVersion: "twelve-data.time-series.v1",
              license: LICENSE,
            },
          });
        }
      }
    }

    return bars.sort((left, right) => left.symbol.localeCompare(right.symbol) || left.sessionDate.localeCompare(right.sessionDate));
  }
}
