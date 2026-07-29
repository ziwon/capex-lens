import type { DailyBar, MacroObservation } from "@capex-lens/providers";
import type { DashboardSnapshot } from "@capex-lens/shared";
import { FRED_SERIES, MARKET_UNIVERSE, memberBySymbol } from "./universe";

const SCORING_VERSION = "market-proxy-v0.1.0";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Cannot render non-finite SQL number: ${value}`);
  return String(value);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function macroMetricId(seriesId: string): string {
  if (seriesId === FRED_SERIES.realYield10y) return "macro.real_yield_10y";
  if (seriesId === FRED_SERIES.investmentGradeOas) return "macro.ig_oas";
  if (seriesId === FRED_SERIES.highYieldOas) return "macro.hy_oas";
  return `macro.fred.${seriesId.toLowerCase()}`;
}

function renderSources(bars: DailyBar[], macro: MacroObservation[]): string[] {
  const sources = new Map<string, { provider: string; sourceType: string; displayName: string; locator: string; license: string; schemaVersion: string }>();
  for (const bar of bars) {
    sources.set(bar.provenance.sourceId, {
      provider: bar.provenance.provider,
      sourceType: "market",
      displayName: "Twelve Data adjusted daily prices",
      locator: bar.provenance.sourceLocator,
      license: bar.provenance.license,
      schemaVersion: bar.provenance.schemaVersion,
    });
  }
  for (const observation of macro) {
    sources.set(observation.provenance.sourceId, {
      provider: observation.provenance.provider,
      sourceType: "macro",
      displayName: `FRED ${observation.seriesId}`,
      locator: observation.provenance.sourceLocator,
      license: observation.provenance.license,
      schemaVersion: observation.provenance.schemaVersion,
    });
  }

  return Array.from(sources, ([id, source]) => `INSERT INTO data_sources (
  id, provider, source_type, display_name, source_locator, license, schema_version, enabled
) VALUES (${sqlString(id)}, ${sqlString(source.provider)}, ${sqlString(source.sourceType)}, ${sqlString(source.displayName)}, ${sqlString(source.locator)}, ${sqlString(source.license)}, ${sqlString(source.schemaVersion)}, 1)
ON CONFLICT(id) DO UPDATE SET
  provider = excluded.provider,
  source_type = excluded.source_type,
  display_name = excluded.display_name,
  source_locator = excluded.source_locator,
  license = excluded.license,
  schema_version = excluded.schema_version,
  enabled = 1,
  updated_at = CURRENT_TIMESTAMP;`);
}

function renderInstruments(macro: MacroObservation[]): string[] {
  const market = Array.from(new Map(MARKET_UNIVERSE.map((member) => [member.symbol, member])).values()).map((member) => `INSERT INTO instruments (
  id, symbol, display_name, asset_type, exchange, currency, basket, metadata_json
) VALUES (${sqlString(`market:${member.symbol}`)}, ${sqlString(member.symbol)}, ${sqlString(member.name)}, 'etf_or_equity', 'US', 'USD', ${sqlString(member.basket)}, ${sqlString(JSON.stringify({ weight: member.weight }))})
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  basket = excluded.basket,
  metadata_json = excluded.metadata_json;`);

  const macroSeries = Array.from(new Set(macro.map((observation) => observation.seriesId))).map((seriesId) => `INSERT INTO instruments (
  id, symbol, display_name, asset_type, exchange, currency, basket, metadata_json
) VALUES (${sqlString(`macro:${seriesId}`)}, ${sqlString(seriesId)}, ${sqlString(`FRED ${seriesId}`)}, 'macro_series', 'FRED', 'N/A', 'macro', '{}')
ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name;`);
  return [...market, ...macroSeries];
}

function marketObservationRows(bars: DailyBar[]): string[] {
  return bars.flatMap((bar) => {
    const instrument = memberBySymbol(bar.symbol);
    const metadata = JSON.stringify({
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      currency: bar.currency,
      basket: instrument?.basket ?? "unknown",
      providerAdjusted: true,
    });
    const common = [
      sqlString(`market:${bar.symbol}`),
      sqlString(bar.provenance.sourceId),
      sqlString(bar.sessionDate),
      sqlString(bar.provenance.availableAt),
      sqlString(bar.provenance.fetchedAt),
      "0",
      sqlString(bar.provenance.contentHash),
      "'valid'",
      sqlString(metadata),
    ];
    return [
      `(${sqlString("market.adjusted_close")}, ${common[0]}, ${common[1]}, ${common[2]}, ${common[3]}, ${common[4]}, ${sqlNumber(bar.adjustedClose)}, ${sqlString(bar.currency)}, ${common[5]}, ${common[6]}, ${common[7]}, ${common[8]})`,
      `(${sqlString("market.volume")}, ${common[0]}, ${common[1]}, ${common[2]}, ${common[3]}, ${common[4]}, ${sqlNumber(bar.volume)}, 'shares', ${common[5]}, ${common[6]}, ${common[7]}, ${common[8]})`,
    ];
  });
}

function macroObservationRows(observations: MacroObservation[]): string[] {
  return observations.map((observation) => `(${sqlString(macroMetricId(observation.seriesId))}, ${sqlString(`macro:${observation.seriesId}`)}, ${sqlString(observation.provenance.sourceId)}, ${sqlString(observation.observationDate)}, ${sqlString(observation.provenance.availableAt)}, ${sqlString(observation.provenance.fetchedAt)}, ${sqlNumber(observation.value)}, ${sqlString(observation.unit)}, 0, ${sqlString(observation.provenance.contentHash)}, 'estimated_available_at', ${sqlString(JSON.stringify({ seriesId: observation.seriesId }))})`);
}

function renderObservationInserts(rows: string[]): string[] {
  return chunks(rows, 200).map((batch) => `INSERT INTO observations (
  metric_id, instrument_id, source_id, observation_date, available_at, ingested_at,
  value, unit, revision, content_hash, quality_status, metadata_json
) VALUES
${batch.join(",\n")}
ON CONFLICT(metric_id, instrument_id, observation_date, available_at, revision) DO UPDATE SET
  value = excluded.value,
  unit = excluded.unit,
  content_hash = excluded.content_hash,
  quality_status = excluded.quality_status,
  metadata_json = excluded.metadata_json,
  ingested_at = excluded.ingested_at;`);
}

function renderDerivedMetrics(snapshot: DashboardSnapshot): string[] {
  const availableAt = snapshot.indicators.map((indicator) => indicator.availableAt).sort().at(-1) ?? snapshot.generatedAt;
  const rows = [
    ...snapshot.indicators.map((indicator) => ({ id: indicator.id, value: indicator.numericValue, unit: "native", components: { formattedValue: indicator.formattedValue, sourceId: indicator.sourceId } })),
    { id: "score.supply", value: snapshot.axes.supply.score, unit: "score", components: snapshot.axes.supply.components },
    { id: "score.monetization", value: snapshot.axes.monetization.score, unit: "score", components: snapshot.axes.monetization.components },
    { id: "score.macro", value: snapshot.axes.macro.score, unit: "score", components: snapshot.axes.macro.components },
    { id: "score.divergence", value: snapshot.divergenceScore, unit: "score", components: { formula: "supply_score - monetization_score" } },
  ];

  return rows.map((row) => `INSERT INTO derived_metrics (
  metric_id, as_of_date, available_at, calculation_version, value, unit, coverage, component_json, quality_status
) VALUES (${sqlString(row.id)}, ${sqlString(snapshot.asOf)}, ${sqlString(availableAt)}, ${sqlString(SCORING_VERSION)}, ${sqlNumber(row.value)}, ${sqlString(row.unit)}, ${sqlNumber(snapshot.coverage / 100)}, ${sqlString(JSON.stringify(row.components))}, 'valid')
ON CONFLICT(metric_id, as_of_date, calculation_version) DO UPDATE SET
  available_at = excluded.available_at,
  value = excluded.value,
  unit = excluded.unit,
  coverage = excluded.coverage,
  component_json = excluded.component_json,
  quality_status = excluded.quality_status,
  generated_at = CURRENT_TIMESTAMP;`);
}

function renderSnapshot(snapshot: DashboardSnapshot): string {
  return `INSERT INTO regime_snapshots (
  as_of_date, generated_at, schema_version, scoring_version, regime, confidence,
  supply_score, monetization_score, macro_score, coverage, data_mode, snapshot_json, publish_status
) VALUES (${sqlString(snapshot.asOf)}, ${sqlString(snapshot.generatedAt)}, ${snapshot.schemaVersion}, ${sqlString(SCORING_VERSION)}, ${sqlString(snapshot.regime)}, ${sqlNumber(snapshot.confidence)}, ${sqlNumber(snapshot.axes.supply.score)}, ${sqlNumber(snapshot.axes.monetization.score)}, ${sqlNumber(snapshot.axes.macro.score)}, ${sqlNumber(snapshot.coverage)}, 'live', ${sqlString(JSON.stringify(snapshot))}, 'published')
ON CONFLICT(as_of_date, scoring_version) DO UPDATE SET
  generated_at = excluded.generated_at,
  regime = excluded.regime,
  confidence = excluded.confidence,
  supply_score = excluded.supply_score,
  monetization_score = excluded.monetization_score,
  macro_score = excluded.macro_score,
  coverage = excluded.coverage,
  data_mode = excluded.data_mode,
  snapshot_json = excluded.snapshot_json,
  publish_status = excluded.publish_status;`;
}

export function renderIngestionSql(bars: DailyBar[], macro: MacroObservation[], snapshot: DashboardSnapshot, codeRevision: string): string {
  const runId = `collect-${snapshot.generatedAt.replaceAll(/[^0-9]/g, "").slice(0, 14)}`;
  const observations = [...marketObservationRows(bars), ...macroObservationRows(macro)];
  const statements = [
    "PRAGMA foreign_keys = ON;",
    ...renderSources(bars, macro),
    ...renderInstruments(macro),
    `INSERT INTO pipeline_runs (id, pipeline_name, code_revision, started_at, status, metadata_json)
VALUES (${sqlString(runId)}, 'live-market-collection', ${sqlString(codeRevision)}, ${sqlString(snapshot.generatedAt)}, 'running', ${sqlString(JSON.stringify({ scoringVersion: SCORING_VERSION }))})
ON CONFLICT(id) DO UPDATE SET status = 'running', error_summary = NULL;`,
    ...renderObservationInserts(observations),
    ...renderDerivedMetrics(snapshot),
    renderSnapshot(snapshot),
    `UPDATE pipeline_runs SET
  finished_at = ${sqlString(new Date().toISOString())},
  status = 'succeeded',
  rows_read = ${bars.length + macro.length},
  rows_written = ${observations.length},
  metadata_json = ${sqlString(JSON.stringify({ scoringVersion: SCORING_VERSION, asOf: snapshot.asOf, regime: snapshot.regime }))}
WHERE id = ${sqlString(runId)};`,
  ];
  return `${statements.join("\n\n")}\n`;
}
