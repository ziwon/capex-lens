# Capex Lens

> **Track the divergence between AI infrastructure momentum and hyperscaler monetization.**

Capex Lens is an evidence-first dashboard for observing the AI infrastructure investment cycle. It is designed around one practical question:

> Is the current semiconductor correction a healthy reset, or the beginning of a broader CAPEX downturn?

The project compares two primary axes:

- **Supply-chain momentum** — relative strength, drawdown, breadth, volatility, and dispersion across semiconductors and AI infrastructure.
- **Hyperscaler monetization** — whether large cloud platforms appear capable of converting AI CAPEX into durable economics.

The first live release labels the second axis **market-implied monetization**. Reported CAPEX, free-cash-flow, cloud-growth, and incremental-ROIC data arrive in the next milestone.

## Status

**Production MVP with an opt-in live pipeline.**

- The production web application is deployed to `https://capex-6i1.pages.dev`.
- Demo mode works without external data-provider credentials.
- Live collection uses Twelve Data adjusted daily US equity/ETF prices and FRED macro series.
- Scores and regime classification are deterministic and versioned.
- Raw API responses are archived before normalized observations and snapshots are published.
- Nothing in the application is a trading signal or investment advice.

## Regime model

| Supply-chain momentum | Monetization | Regime |
|---|---|---|
| Strong | Strong | `CAPEX Expansion` |
| Weak | Strong | `Healthy Reset` |
| Strong | Weak | `Bubble Divergence` |
| Weak | Weak | `CAPEX Downturn` |

## Current data universe

**Supply proxy and basket**

`SOXX`, `NVDA`, `AVGO`, `AMD`, `MU`, `TSM`, `ASML`, `AMAT`, `LRCX`

**Hyperscalers**

`MSFT`, `AMZN`, `GOOGL`, `META`, `ORCL`

**Market references**

`QQQ`, `SPY`, `IWM`, `CPER`, `TLT`, `HYG`, `UUP`

**FRED series**

- `DFII10` — 10-year real yield
- `BAMLC0A0CM` — investment-grade option-adjusted spread
- `BAMLH0A0HYM2` — high-yield option-adjusted spread

`CPER` is used as a documented tradable copper proxy. It is not a direct copper-futures settlement series.

## Included

- React + Vite dashboard
- Cloudflare Worker API with Static Assets
- Typed dashboard and regime contracts
- Deterministic indicator and scoring utilities with tests
- Twelve Data and FRED provider adapters
- Raw-payload manifest and R2 upload flow
- D1 schema and idempotent ingestion SQL
- Live D1 snapshot and metric-series API
- GitHub Actions for CI, weekday collection, artifacts, and optional Cloudflare publication
- `PLAN.md` defining methodology, delivery stages, and data-quality guardrails

## Local development

Requirements:

- Node.js 22+
- pnpm 10+

```bash
corepack enable
pnpm install
pnpm dev
```

The Vite application falls back to the built-in demo snapshot when the Worker API is unavailable.

Run the complete Cloudflare Worker and static application locally:

```bash
pnpm build
pnpm dev:edge
```

Run the Pages production topology locally. The Pages Function keeps the browser on
the same origin and proxies only read-only `/api/*` requests to the Worker API:

```bash
pnpm build
pnpm exec wrangler pages dev dist --cwd apps/web
```

Verify the repository:

```bash
pnpm typecheck
pnpm test
pnpm collect:demo
pnpm build
```

## Live collection

Copy `.env.example` to a local ignored environment file and provide:

```bash
TWELVE_DATA_API_KEY=...
FRED_API_KEY=...
TWELVE_DATA_CREDITS_PER_MINUTE=8
```

Then run:

```bash
set -a
source .env
set +a
pnpm collect:live
```

The collector writes:

```text
.data/live-snapshot.json
.data/live-ingest.sql
.data/raw-manifest.json
.data/raw/market/...
.data/raw/macro/...
```

The default Twelve Data Basic allowance is eight API credits per minute. The adapter batches symbols and waits between credit windows, so a daily collection takes a few minutes rather than bursting into rate-limit failures.

### Data-license boundary

The selected Twelve Data Basic plan is appropriate for private/internal non-display validation. Before making Capex Lens public, review and obtain the required display and redistribution rights. The provider is isolated behind an adapter so it can be upgraded or replaced without changing the scoring domain.

## Cloudflare resources

Create the resources once:

```bash
pnpm exec wrangler d1 create capex-lens --location apac
pnpm exec wrangler r2 bucket create capex-lens-raw --location apac
```

Copy the D1 database ID into `wrangler.jsonc` using `wrangler.live.example.jsonc` as the template, add the `DB` binding, add the `RAW` R2 binding, and change `DATA_MODE` to `live` only after the first valid snapshot is present.

Apply and publish manually:

```bash
pnpm publish:live
pnpm build
pnpm exec wrangler deploy
pnpm deploy:pages
```

Required GitHub repository secrets:

```text
TWELVE_DATA_API_KEY
FRED_API_KEY
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Useful repository variables:

```text
TWELVE_DATA_CREDITS_PER_MINUTE=8
COLLECTION_LOOKBACK_DAYS=500
MAX_BENCHMARK_AGE_HOURS=96
D1_DATABASE_NAME=capex-lens
R2_BUCKET_NAME=capex-lens-raw
ENABLE_LIVE_PUBLISH=false
```

The weekday workflow always creates a collection artifact. It publishes to Cloudflare only when manually requested or when `ENABLE_LIVE_PUBLISH=true`.

## Repository layout

```text
apps/web/              React dashboard and Cloudflare Pages API proxy
workers/api/           Cloudflare Worker API and asset router
packages/shared/       Cross-runtime data contracts and demo snapshot
packages/indicators/   Deterministic indicator calculations
packages/providers/    Twelve Data, FRED, and provenance contracts
packages/db/           D1 storage and query helpers
migrations/            D1 schema migrations
scripts/               Collection, scoring, SQL rendering, and publication
.github/workflows/     CI, collection, and deployment workflows
```

## Temporal and provenance policy

- `observation_date` records what date a value describes.
- `available_at` records when the pipeline is allowed to use it.
- `ingested_at` records when Capex Lens stored it.
- Market bars use conservative post-close timestamps.
- FRED daily series currently use conservative estimated availability timestamps; ALFRED vintage-aware replay is planned before historical model claims are made.
- Raw, normalized, derived, and narrative layers remain separate.
- Scores are computed by deterministic code, never by an LLM.
- AI reports may explain validated metrics, surface counter-evidence, and cite metric IDs.

See [PLAN.md](./PLAN.md) for the complete execution plan.

## License

Private and unlicensed while the MVP is being validated.
