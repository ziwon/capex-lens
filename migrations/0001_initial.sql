PRAGMA foreign_keys = ON;

CREATE TABLE data_sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_locator TEXT,
  license TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE instruments (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  display_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  exchange TEXT,
  currency TEXT,
  basket TEXT,
  active_from TEXT,
  active_to TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(symbol, exchange)
);

CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_id TEXT NOT NULL,
  instrument_id TEXT,
  source_id TEXT NOT NULL,
  observation_date TEXT NOT NULL,
  available_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  quality_status TEXT NOT NULL DEFAULT 'valid',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (instrument_id) REFERENCES instruments(id),
  FOREIGN KEY (source_id) REFERENCES data_sources(id),
  UNIQUE(metric_id, instrument_id, observation_date, available_at, revision)
);

CREATE INDEX idx_observations_metric_date ON observations(metric_id, observation_date DESC);
CREATE INDEX idx_observations_available_at ON observations(available_at DESC);

CREATE TABLE derived_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  available_at TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  coverage REAL NOT NULL CHECK (coverage >= 0 AND coverage <= 1),
  component_json TEXT NOT NULL,
  quality_status TEXT NOT NULL DEFAULT 'valid',
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(metric_id, as_of_date, calculation_version)
);

CREATE INDEX idx_derived_metrics_date ON derived_metrics(as_of_date DESC, metric_id);

CREATE TABLE regime_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  as_of_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  scoring_version TEXT NOT NULL,
  regime TEXT NOT NULL CHECK (regime IN ('capex_expansion', 'healthy_reset', 'bubble_divergence', 'capex_downturn')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  supply_score REAL NOT NULL CHECK (supply_score BETWEEN -100 AND 100),
  monetization_score REAL NOT NULL CHECK (monetization_score BETWEEN -100 AND 100),
  macro_score REAL NOT NULL CHECK (macro_score BETWEEN -100 AND 100),
  coverage REAL NOT NULL CHECK (coverage >= 0 AND coverage <= 100),
  data_mode TEXT NOT NULL CHECK (data_mode IN ('demo', 'live')),
  snapshot_json TEXT NOT NULL,
  publish_status TEXT NOT NULL DEFAULT 'draft' CHECK (publish_status IN ('draft', 'published', 'rejected')),
  UNIQUE(as_of_date, scoring_version)
);

CREATE INDEX idx_regime_snapshots_published ON regime_snapshots(publish_status, as_of_date DESC);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly')),
  period_key TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  prompt_version TEXT,
  report_json TEXT NOT NULL,
  source_metric_ids_json TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending', 'valid', 'rejected')),
  UNIQUE(period_type, period_key, prompt_version)
);

CREATE TABLE pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_name TEXT NOT NULL,
  code_revision TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'partial')),
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
