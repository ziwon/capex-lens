# Capex Lens

> **Track the divergence between AI infrastructure momentum and hyperscaler monetization.**

Capex Lens is an evidence-first dashboard for observing the AI infrastructure investment cycle. It is designed around one practical question:

> Is the current semiconductor correction a healthy reset, or the beginning of a broader CAPEX downturn?

The project compares two primary axes:

- **Supply-chain momentum** — relative strength, drawdown, breadth, volatility, and valuation pressure across semiconductors and AI infrastructure.
- **Hyperscaler monetization** — whether large cloud platforms are converting AI CAPEX into revenue, margins, free cash flow, and improving capital efficiency.

## Status

**Private MVP scaffold.** The current application runs with clearly labelled illustrative data. No value shown in the demo is a live market observation or a trading signal.

## Regime model

| Supply-chain momentum | Monetization | Regime |
|---|---|---|
| Strong | Strong | `CAPEX Expansion` |
| Weak | Strong | `Healthy Reset` |
| Strong | Weak | `Bubble Divergence` |
| Weak | Weak | `CAPEX Downturn` |

## Included in the scaffold

- React + Vite dashboard
- Cloudflare Worker API with Static Assets
- Typed dashboard and regime contracts
- Deterministic indicator utilities with tests
- D1 schema for observations, derived metrics, regime snapshots, and reports
- Provider interfaces for market, macro, and fundamental data
- GitHub Actions for CI, scheduled contract validation, and manual deployment
- `PLAN.md` defining the product thesis, methodology, delivery stages, and guardrails

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

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm collect:demo
```

## Repository layout

```text
apps/web/              React dashboard
workers/api/           Cloudflare Worker API and asset router
packages/shared/       Cross-runtime data contracts and demo snapshot
packages/indicators/   Deterministic indicator calculations
packages/providers/    Data-provider and provenance contracts
packages/db/           D1 row contracts and storage helpers
migrations/            D1 schema migrations
scripts/               Batch collection and validation scripts
.github/workflows/     CI, collection, and deployment workflows
```

## Deployment preparation

The first Worker can deploy without D1 because it serves a demo snapshot. Before enabling live collection:

1. Create a D1 database and an R2 bucket.
2. Add their bindings to `wrangler.jsonc`.
3. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as repository secrets.
4. Configure a licensed market-data provider and FRED/SEC collectors.
5. Apply `migrations/0001_initial.sql`.
6. Change `DATA_MODE` from `demo` to `live` only after freshness and provenance checks pass.

See [PLAN.md](./PLAN.md) for the complete execution plan.

## Data and AI policy

- Every observation records both the date it describes and the time it became available.
- Raw source payloads are preserved separately from normalized and derived data.
- Scores are computed by deterministic code, not by an LLM.
- AI reports explain changes, surface counter-evidence, and cite metric identifiers.
- Capex Lens is an analytical research tool, not investment advice or an automated trading system.

## License

Private and unlicensed while the MVP is being validated.
