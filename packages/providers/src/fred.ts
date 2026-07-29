import { sha256Hex } from "./crypto";
import type { MacroDataProvider, MacroObservation, RawPayloadSink } from "./index";

const BASE_URL = "https://api.stlouisfed.org/fred/series/observations";
const LICENSE = "Federal Reserve Bank of St. Louis FRED Terms of Use";

interface FredObservationPayload {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string;
}

interface FredResponse {
  realtime_start?: string;
  realtime_end?: string;
  units?: string;
  observations?: FredObservationPayload[];
  error_code?: number;
  error_message?: string;
}

export interface FredProviderOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  rawSink?: RawPayloadSink;
}

function estimatedAvailableAt(observationDate: string): string {
  const date = new Date(`${observationDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid FRED observation date: ${observationDate}`);
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T23:59:59Z`;
}

function safeSeriesId(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error(`Invalid FRED series id: ${value}`);
  return value;
}

export class FredProvider implements MacroDataProvider {
  readonly id = "fred";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly rawSink: RawPayloadSink | null;

  constructor(options: FredProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("FRED API key is required");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.rawSink = options.rawSink ?? null;
  }

  async getSeries(seriesIds: string[], from: string, to: string): Promise<MacroObservation[]> {
    const uniqueSeries = Array.from(new Set(seriesIds.map((seriesId) => safeSeriesId(seriesId.trim())).filter(Boolean)));
    const groups = await Promise.all(uniqueSeries.map((seriesId) => this.fetchSeries(seriesId, from, to)));
    return groups.flat().sort((left, right) => left.seriesId.localeCompare(right.seriesId) || left.observationDate.localeCompare(right.observationDate));
  }

  private async fetchSeries(seriesId: string, from: string, to: string): Promise<MacroObservation[]> {
    const fetchedAt = new Date().toISOString();
    const url = new URL(BASE_URL);
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("observation_start", from);
    url.searchParams.set("observation_end", to);
    url.searchParams.set("sort_order", "asc");

    const response = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    const body = await response.text();
    if (!response.ok) throw new Error(`FRED request failed for ${seriesId} (${response.status}): ${body.slice(0, 300)}`);

    let payload: FredResponse;
    try {
      payload = JSON.parse(body) as FredResponse;
    } catch (error) {
      throw new Error(`FRED returned malformed JSON for ${seriesId}: ${String(error)}`);
    }
    if (payload.error_code !== undefined) throw new Error(`FRED error for ${seriesId}: ${payload.error_message ?? payload.error_code}`);
    if (!Array.isArray(payload.observations)) throw new Error(`FRED returned no observation array for ${seriesId}`);

    const contentHash = await sha256Hex(body);
    const sanitizedUrl = new URL(url);
    sanitizedUrl.searchParams.delete("api_key");
    const sourceLocator = sanitizedUrl.toString();

    if (this.rawSink !== null) {
      await this.rawSink({
        provider: this.id,
        sourceId: `fred.${seriesId}`,
        objectKey: `macro/fred/${to}/${seriesId}.json`,
        sourceLocator,
        fetchedAt,
        contentType: "application/json",
        contentHash,
        schemaVersion: "fred.series-observations.v1",
        license: LICENSE,
        body,
      });
    }

    const unit = payload.units ?? "value";
    return payload.observations.flatMap((observation) => {
      if (observation.value === ".") return [];
      const value = Number(observation.value);
      if (!Number.isFinite(value)) throw new Error(`FRED returned invalid value for ${seriesId} on ${observation.date}`);
      return [{
        seriesId,
        observationDate: observation.date,
        value,
        unit,
        provenance: {
          provider: this.id,
          sourceId: `fred.${seriesId}`,
          sourceLocator,
          fetchedAt,
          availableAt: estimatedAvailableAt(observation.date),
          contentHash,
          schemaVersion: "fred.series-observations.v1",
          license: LICENSE,
        },
      }];
    });
  }
}
