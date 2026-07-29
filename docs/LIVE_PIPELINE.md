# Live pipeline runbook

## 1. Required secrets

Configure these GitHub repository secrets:

- `TWELVE_DATA_API_KEY`
- `FRED_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Keep `ENABLE_LIVE_PUBLISH=false` until D1 and R2 are created and a collection artifact has been inspected.

## 2. Create Cloudflare resources

```bash
pnpm exec wrangler d1 create capex-lens --location apac
pnpm exec wrangler r2 bucket create capex-lens-raw --location apac
```

Use `wrangler.live.example.jsonc` to add the returned D1 database ID and R2 binding to `wrangler.jsonc`.

## 3. Validate collection without publication

Run the `Collect and publish` workflow manually with `publish=false`.

Inspect the artifact:

- `live-snapshot.json`
- `live-ingest.sql`
- `raw-manifest.json`
- `raw/market/...`
- `raw/macro/...`

Confirm that coverage is at least 70%, timestamps are not in the future, and the snapshot is labelled `mode=live`.
Confirm that `SOXX` and `QQQ` both match the snapshot `asOf` date and that their `availableAt` age is within `MAX_BENCHMARK_AGE_HOURS` (96 hours by default).

## 4. First publication

Run the same workflow with `publish=true`. The workflow applies D1 migrations, uploads raw JSON to R2, and executes the idempotent ingestion SQL.

Verify:

```bash
pnpm exec wrangler d1 execute capex-lens --remote \
  --command "SELECT as_of_date, regime, confidence, coverage FROM regime_snapshots ORDER BY as_of_date DESC LIMIT 5"
```

## 5. Enable live Worker mode

After a published snapshot exists:

1. Set `DATA_MODE=live` in `wrangler.jsonc`.
2. Confirm the `DB` binding points to `capex-lens`.
3. Build and deploy.

```bash
pnpm build
pnpm exec wrangler deploy
```

Check:

```text
GET /api/health
GET /api/v1/snapshot
GET /api/v1/methodology
GET /api/v1/series/market.adjusted_close
```

## 6. Deploy the production web application

The public Pages project serves the web application at `https://capex-6i1.pages.dev`.
Its Pages Function proxies read-only `/api/*` requests to the Worker API, keeping
the browser on a single origin.

```bash
pnpm deploy:pages
```

Verify:

```text
GET https://capex-6i1.pages.dev/
GET https://capex-6i1.pages.dev/api/health
GET https://capex-6i1.pages.dev/api/v1/snapshot
```

## 7. Scheduled publication

Set the repository variable `ENABLE_LIVE_PUBLISH=true` only after the first manual publication and Worker verification succeed.

If a collector fails, the last published D1 snapshot remains available. Do not change the Worker to serve an unvalidated artifact directly.
