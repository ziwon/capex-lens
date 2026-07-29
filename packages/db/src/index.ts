import type { DashboardSnapshot } from "@capex-lens/shared";

interface SnapshotRow { snapshot_json: string; }
interface ObservationRow {
  date: string;
  available_at: string;
  value: number;
  unit: string;
  instrument_id: string | null;
}

export interface MetricSeriesPoint {
  date: string;
  availableAt: string;
  value: number;
  unit: string;
  instrumentId: string | null;
}

export async function getLatestSnapshot(db: D1Database): Promise<DashboardSnapshot | null> {
  const row = await db.prepare(`SELECT snapshot_json FROM regime_snapshots WHERE publish_status = 'published' ORDER BY as_of_date DESC, generated_at DESC LIMIT 1`).first<SnapshotRow>();
  return row ? JSON.parse(row.snapshot_json) as DashboardSnapshot : null;
}

export async function getMetricSeries(db: D1Database, metricId: string, limit = 500): Promise<MetricSeriesPoint[]> {
  const safeLimit = Math.max(1, Math.min(2_000, Math.floor(limit)));
  const result = await db.prepare(`SELECT
    observation_date AS date,
    available_at,
    value,
    unit,
    instrument_id
  FROM observations
  WHERE metric_id = ?
  ORDER BY observation_date DESC, available_at DESC
  LIMIT ?`).bind(metricId, safeLimit).all<ObservationRow>();
  return result.results.reverse().map((row) => ({
    date: row.date,
    availableAt: row.available_at,
    value: row.value,
    unit: row.unit,
    instrumentId: row.instrument_id,
  }));
}

export async function saveSnapshot(db: D1Database, snapshot: DashboardSnapshot, scoringVersion: string): Promise<void> {
  await db.prepare(`INSERT INTO regime_snapshots (
    as_of_date, generated_at, schema_version, scoring_version, regime, confidence,
    supply_score, monetization_score, macro_score, coverage, data_mode, snapshot_json, publish_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
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
    publish_status = excluded.publish_status`)
    .bind(snapshot.asOf, snapshot.generatedAt, snapshot.schemaVersion, scoringVersion, snapshot.regime,
      snapshot.confidence, snapshot.axes.supply.score, snapshot.axes.monetization.score,
      snapshot.axes.macro.score, snapshot.coverage, snapshot.mode, JSON.stringify(snapshot))
    .run();
}
