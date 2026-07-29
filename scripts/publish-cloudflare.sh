#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

D1_DATABASE_NAME="${D1_DATABASE_NAME:-capex-lens}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-capex-lens-raw}"
OUTPUT_DIR="${OUTPUT_DIR:-.data}"
SQL_FILE="${OUTPUT_DIR}/live-ingest.sql"
RAW_DIR="${OUTPUT_DIR}/raw"

if [[ ! -f "${SQL_FILE}" ]]; then
  echo "Missing ${SQL_FILE}; run pnpm collect:live first" >&2
  exit 1
fi

pnpm exec wrangler d1 migrations apply "${D1_DATABASE_NAME}" --remote

if [[ -d "${RAW_DIR}" ]]; then
  while IFS= read -r -d '' file; do
    key="${file#${RAW_DIR}/}"
    pnpm exec wrangler r2 object put "${R2_BUCKET_NAME}/${key}" \
      --file "${file}" \
      --content-type application/json \
      --remote \
      --force
  done < <(find "${RAW_DIR}" -type f -name '*.json' -print0 | sort -z)
fi

pnpm exec wrangler d1 execute "${D1_DATABASE_NAME}" \
  --remote \
  --file "${SQL_FILE}" \
  --yes

echo "Published Capex Lens live data to D1=${D1_DATABASE_NAME} and R2=${R2_BUCKET_NAME}"
