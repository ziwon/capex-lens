# Capex Lens — MVP Plan

## 1. Product thesis

AI infrastructure equities can remain strong even while the companies funding the build-out experience weaker free cash flow, higher financing costs, and declining returns on incremental capital. That divergence is not proof of a bubble, but it is an observable late-cycle risk.

Capex Lens will answer one narrow question:

> **Is AI supply-chain weakness a healthy valuation reset, or evidence that hyperscaler CAPEX is failing to convert into durable cash flow?**

The product is a research dashboard, not a price-prediction engine. It should show the current regime, the evidence supporting it, the evidence against it, and what would invalidate the assessment.

### Product statement

**Capex Lens tracks the divergence between AI infrastructure momentum and hyperscaler monetization.**

### Initial users

- Technology and semiconductor investors
- Macro and gold/FX traders monitoring growth and liquidity risk
- AI infrastructure practitioners who want a financial view of the build-out
- Researchers writing evidence-linked market commentary

## 2. Core regime model

The dashboard uses two primary normalized scores in the range `[-100, 100]`.

- **Supply-chain momentum score (`S`)**
- **Hyperscaler monetization score (`M`)**

The sign of each score defines four regimes:

| `S` | `M` | Regime | Interpretation |
|---:|---:|---|---|
| positive | positive | **CAPEX Expansion** | Infrastructure demand and monetization reinforce each other. |
| negative | positive | **Healthy Reset** | Supply-chain valuations cool while customer economics remain resilient. |
| positive | negative | **Bubble Divergence** | Supplier momentum outruns customer cash-flow evidence. |
| negative | negative | **CAPEX Downturn** | Weak demand expectations and weak customer economics reinforce each other. |

A `±10` neutral band and previous-regime hysteresis will prevent noisy daily regime flipping. Confidence will reflect distance from regime boundaries, data freshness, source coverage, and cross-indicator agreement.

## 3. MVP scope

### MVP 0.1 — market and macro observation

The first live version will establish the collection and scoring pipeline using daily market and macro data.

#### Supply-chain universe

Primary proxy: `SOXX`

Initial basket: `NVDA`, `AVGO`, `AMD`, `MU`, `TSM`, `ASML`, `AMAT`, and `LRCX`.

#### Hyperscaler universe

`MSFT`, `AMZN`, `GOOGL`, `META`, and `ORCL`.

#### Market and macro references

- `QQQ`, `SPY`, and `IWM`
- 10-year US real yield
- Investment-grade and high-yield option-adjusted spreads
- Copper or a documented copper proxy
- Broad US dollar and Treasury-duration proxies

#### MVP indicators

- 20-, 60-, and 120-trading-day total return
- Supply-chain versus Nasdaq relative strength
- Hyperscaler versus supply-chain relative strength
- Drawdown from rolling 52-week high
- 20- and 60-day realized volatility
- Breadth above 50- and 200-day moving averages
- Cross-sectional dispersion
- Credit-spread and real-yield changes
- Data freshness and coverage status

MVP 0.1 must label the monetization axis as a **market-implied monetization proxy** until fundamental data is available.

### MVP 0.2 — fundamental monetization

Add quarterly SEC and investor-relations data:

- Revenue and cloud-segment growth
- Capital expenditure, operating cash flow, and free cash flow
- Depreciation and amortization
- CAPEX / revenue and CAPEX / operating cash flow
- Incremental revenue / incremental CAPEX
- FCF margin, net debt, and financing cost
- CAPEX and revenue guidance revisions

The production monetization score should combine market-implied evidence with reported fundamental evidence. Every component must expose its formula and source.

### MVP 0.3 — evidence-linked AI brief

Generate a concise daily change note and a weekly regime review containing primary drivers, counter-evidence, next metrics to watch, uncertainty warnings, and metric/source identifiers for every material claim.

## 4. Non-goals

The MVP will not provide intraday quotes, automated trading signals, portfolio execution, options-flow analytics, unexplained ML forecasts, a general-purpose terminal, or graph/vector infrastructure before document volume justifies it.

## 5. Scoring methodology

### 5.1 Normalization

Each component is transformed using a robust rolling z-score:

```text
z_i(t) = (x_i(t) - rolling_median_i) / (1.4826 × rolling_MAD_i)
```

The value is winsorized, direction-adjusted so higher is better for the relevant axis, and mapped to `[-100, 100]`. A component is `null`, not zero, when data is missing. Aggregates are reweighted only when minimum coverage is satisfied.

### 5.2 Initial supply-chain weights

| Component | Weight |
|---|---:|
| SOXX / QQQ relative strength | 25% |
| Constituent breadth | 20% |
| 52-week drawdown state | 20% |
| Multi-horizon momentum | 15% |
| Realized volatility and dispersion | 10% |
| Seasonal deviation | 10% |

Seasonality is contextual evidence, not a standalone signal.

### 5.3 Initial monetization weights

For MVP 0.1, the score is explicitly a market proxy:

| Component | Weight |
|---|---:|
| Hyperscaler / supply relative strength | 40% |
| Hyperscaler breadth | 20% |
| Hyperscaler drawdown resilience | 15% |
| Credit-risk proxy | 15% |
| Long-duration rate pressure | 10% |

For MVP 0.2, reported fundamentals replace most proxy weight:

| Component | Weight |
|---|---:|
| CAPEX-to-FCF conversion | 25% |
| Cloud and AI revenue acceleration | 20% |
| FCF margin and cash-flow resilience | 20% |
| Incremental capital efficiency | 15% |
| Guidance revisions | 10% |
| Credit and financing stress | 10% |

Weights are configuration, versioned with each snapshot, and changed only through reviewed code.

### 5.4 Confidence

Confidence combines distance from neutral boundaries, component agreement, source coverage, freshness, and the share of the score based on reported fundamentals. The UI must not imply high confidence while the fundamental layer is absent.

## 6. Data architecture

```text
GitHub Actions
  ├─ market / FRED / SEC collectors
  ├─ validation and normalization
  └─ deterministic indicator computation
          │
          ├─ R2: immutable raw payloads
          └─ D1: observations, metrics, snapshots, reports
                              │
Cloudflare Worker + Static Assets
  ├─ read API
  ├─ dashboard
  ├─ methodology
  └─ report archive
```

Cloudflare Queues and Workflows are added only when provider throttling or durable multi-step report generation requires them. Workers AI or an external LLM is used for narrative analysis only.

## 7. Temporal and provenance rules

Every observation stores `observation_date`, `available_at`, `ingested_at`, `source_id`, `source_locator`, `content_hash`, `provider`, `schema_version`, and `quality_status`. These fields prevent look-ahead bias and make historical replay reproducible.

Raw, normalized, and derived data remain separate. Restatements create new versions rather than silently overwriting past knowledge states.

## 8. API surface

Initial read-only endpoints:

```text
GET /api/health
GET /api/v1/snapshot
GET /api/v1/methodology
GET /api/v1/series/:metricId
GET /api/v1/reports
GET /api/v1/reports/:period
```

The live-market branch implements health, snapshot, methodology, and metric-series endpoints. Report endpoints remain part of MVP 0.3.

## 9. Dashboard

The executive page contains the current regime, two-axis map, supply/monetization/macro scores, divergence history, important changes, weekly evidence brief, and freshness warning. Planned dedicated views are `/supply-chain`, `/hyperscalers`, `/macro`, `/reports`, and `/methodology`.

## 10. AI analysis contract

The LLM receives validated metrics and selected evidence. It never calculates scores. Its structured result contains the regime, confidence, headline, primary drivers, counter-evidence, next observations, source metric IDs, and disclaimer. Narrative claims without known evidence IDs are rejected.

## 11. Data-quality gates

A live snapshot will not publish when benchmark data is stale, basket coverage is below 70%, corporate-action checks fail, a timestamp introduces look-ahead bias, a score is non-finite, a provider schema changes unexpectedly, or an AI report cites unknown metrics. The last valid snapshot remains visible with a stale warning.

## 12. Security and operations

- Cloudflare tokens use minimum scope.
- Provider keys remain in GitHub or Worker secrets.
- Collector writes are idempotent.
- Raw payloads use immutable keys and hashes.
- Pipeline runs record status, counts, errors, and code revision.
- Administrative routes use Cloudflare Access.
- Public deployment remains disabled until licensing is reviewed.

## 13. Delivery milestones

### M0 — scaffold

- [x] Private repository and plan
- [x] Typed demo snapshot and responsive dashboard
- [x] Worker API and Static Assets configuration
- [x] Indicator utility tests and D1 migration
- [x] CI, collection, and deployment skeleton

### M1 — live market pipeline

- [x] Select Twelve Data for private/internal daily market validation and document the public-display license boundary
- [ ] Create production D1 and R2 resources
- [x] Implement Twelve Data and FRED collectors with immutable raw payload capture
- [ ] Complete independent corporate-action reconciliation; provider-adjusted prices are used meanwhile
- [x] Implement freshness, coverage, finite-score, and evidence-reference publication gates
- [x] Implement deterministic market-proxy regime snapshots and idempotent D1 publication
- [x] Add approximately 500-calendar-day collection/backfill and the metric-series API
- [ ] Run the first credentialed collection, inspect its artifact, and enable scheduled publication

### M2 — fundamental monetization

- [ ] Implement SEC Company Facts ingestion
- [ ] Add company-specific XBRL mappings
- [ ] Parse IR CAPEX and cloud guidance with evidence links
- [ ] Version the fundamental monetization formula
- [ ] Show reported versus proxy contribution

### M3 — weekly intelligence

- [ ] Add durable report workflow
- [ ] Generate structured weekly briefs
- [ ] Add counter-evidence and upcoming-event sections
- [ ] Archive and compare reports

### M4 — validation

- [ ] Point-in-time historical replay
- [ ] Weight and neutral-band sensitivity analysis
- [ ] Regime stability review
- [ ] Data-license and public-release decision

## 14. MVP completion criteria

A user must be able to identify the active regime, see which metrics moved it, distinguish market proxies from reported fundamentals, inspect counter-evidence and freshness, and understand what would cause a regime change.
