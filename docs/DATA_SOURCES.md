# Data-source decisions

## Market data: Twelve Data

The private MVP uses the Twelve Data `/time_series` API with `interval=1day` and `adjust=all`.

Reasons:

- The Basic plan provides enough daily capacity for the initial 21-symbol universe.
- Batch requests and a documented credit model make scheduled GitHub Actions predictable.
- US equities and ETFs cover the supply, hyperscaler, benchmark, rates, credit, dollar, and copper-proxy baskets.
- The provider is isolated behind `MarketDataProvider`, so replacement does not affect scoring code.

Operational constraints:

- The Basic allowance is eight API credits per minute and 800 per day at the time of selection.
- The adapter batches at the configured per-minute credit limit and waits between windows.
- Basic is treated as private/internal non-display use. Public display or redistribution requires a license review and likely a paid plan.
- `adjust=all` values are treated as adjusted daily OHLC data; raw responses are retained for audit.

## Macro data: FRED

The MVP uses the official FRED series-observations API for:

- `DFII10` — 10-year real yield
- `BAMLC0A0CM` — investment-grade option-adjusted spread
- `BAMLH0A0HYM2` — high-yield option-adjusted spread

FRED responses do not expose a precise intraday publication timestamp for each daily observation. The collector therefore assigns a conservative estimated `available_at` of the following calendar day at 23:59:59 UTC and labels the normalized row `estimated_available_at`.

Historical research and backtests must not claim point-in-time accuracy until ALFRED vintage-aware ingestion is implemented.

## Copper

The first version uses `CPER` as a tradable copper proxy. This avoids mixing a separately licensed futures feed into the initial market adapter. The dashboard and methodology must state that CPER is not the direct copper-futures settlement price.

## Storage

- R2 stores immutable raw provider responses using provider/date/object keys.
- D1 stores normalized observations, derived metrics, regime snapshots, reports, and pipeline-run metadata.
- Normalized rows reference a source ID, source locator without credentials, schema version, content hash, and availability timestamp.
