import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FredProvider, TwelveDataProvider } from "@capex-lens/providers";
import type { DashboardSnapshot } from "@capex-lens/shared";
import { buildLiveSnapshot } from "./lib/build-snapshot";
import { createFileRawSink } from "./lib/raw-sink";
import { renderIngestionSql } from "./lib/render-sql";
import { FRED_SERIES_IDS, MARKET_SYMBOLS } from "./lib/universe";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live collection`);
  return value;
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function validateSnapshot(snapshot: DashboardSnapshot): void {
  const scores = [snapshot.axes.supply.score, snapshot.axes.monetization.score, snapshot.axes.macro.score];
  if (scores.some((score) => !Number.isFinite(score) || score < -100 || score > 100)) {
    throw new Error("Axis scores must be finite values between -100 and 100");
  }
  if (snapshot.mode !== "live") throw new Error("Live collector produced a non-live snapshot");
  if (snapshot.coverage < 70) throw new Error(`Snapshot coverage ${snapshot.coverage}% is below the publication gate`);
  if (snapshot.confidence < 0 || snapshot.confidence > 1) throw new Error("Confidence must be between 0 and 1");
  const knownMetricIds = new Set(snapshot.indicators.map((indicator) => indicator.id));
  const missing = snapshot.report.sourceMetricIds.filter((metricId) => !knownMetricIds.has(metricId));
  if (missing.length > 0) throw new Error(`Report references unknown metrics: ${missing.join(", ")}`);
}

async function main(): Promise<void> {
  const outputDirectory = resolve(process.env.OUTPUT_DIR ?? ".data");
  await mkdir(outputDirectory, { recursive: true });
  const raw = createFileRawSink(outputDirectory);

  const lookbackDays = Number(process.env.COLLECTION_LOOKBACK_DAYS ?? "500");
  if (!Number.isInteger(lookbackDays) || lookbackDays < 400) throw new Error("COLLECTION_LOOKBACK_DAYS must be an integer of at least 400");
  const from = process.env.COLLECTION_START_DATE ?? dateDaysAgo(lookbackDays);
  const to = process.env.COLLECTION_END_DATE ?? new Date().toISOString().slice(0, 10);
  const creditsPerMinute = Number(process.env.TWELVE_DATA_CREDITS_PER_MINUTE ?? "8");
  const maxBenchmarkAgeHours = Number(process.env.MAX_BENCHMARK_AGE_HOURS ?? "96");
  if (!Number.isFinite(maxBenchmarkAgeHours) || maxBenchmarkAgeHours <= 0) {
    throw new Error("MAX_BENCHMARK_AGE_HOURS must be a positive finite number");
  }

  const marketProvider = new TwelveDataProvider({
    apiKey: requiredEnvironment("TWELVE_DATA_API_KEY"),
    creditsPerMinute,
    rawSink: raw.sink,
  });
  const macroProvider = new FredProvider({
    apiKey: requiredEnvironment("FRED_API_KEY"),
    rawSink: raw.sink,
  });

  console.log(JSON.stringify({
    event: "live_collection_started",
    from,
    to,
    marketSymbols: MARKET_SYMBOLS.length,
    macroSeries: FRED_SERIES_IDS.length,
    creditsPerMinute,
    maxBenchmarkAgeHours,
  }));

  const [bars, macro] = await Promise.all([
    marketProvider.getDailyBars(MARKET_SYMBOLS, from, to),
    macroProvider.getSeries(FRED_SERIES_IDS, from, to),
  ]);

  const generatedAt = new Date().toISOString();
  const snapshot = buildLiveSnapshot(bars, macro, generatedAt, { maxBenchmarkAgeHours });
  validateSnapshot(snapshot);
  const sql = renderIngestionSql(bars, macro, snapshot, process.env.GITHUB_SHA ?? "local");

  const snapshotPath = resolve(outputDirectory, "live-snapshot.json");
  const sqlPath = resolve(outputDirectory, "live-ingest.sql");
  const manifestPath = resolve(outputDirectory, "raw-manifest.json");
  await Promise.all([
    writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8"),
    writeFile(sqlPath, sql, "utf8"),
    writeFile(manifestPath, `${JSON.stringify(raw.entries, null, 2)}\n`, "utf8"),
  ]);

  console.log(JSON.stringify({
    event: "live_collection_completed",
    from,
    to,
    asOf: snapshot.asOf,
    regime: snapshot.regime,
    coverage: snapshot.coverage,
    confidence: snapshot.confidence,
    bars: bars.length,
    macroObservations: macro.length,
    rawPayloads: raw.entries.length,
    snapshotPath,
    sqlPath,
    manifestPath,
  }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
