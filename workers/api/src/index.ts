import { getLatestSnapshot, getMetricSeries } from "@capex-lens/db";
import { demoSnapshot } from "@capex-lens/shared";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  DATA_MODE: "demo" | "live";
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60, stale-while-revalidate=300",
  "x-content-type-options": "nosniff",
};

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(jsonHeaders)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return Response.json(data, { ...init, headers });
}

function methodology(mode: "demo" | "live"): object {
  return {
    version: "0.2.0",
    scoringVersion: "market-proxy-v0.1.0",
    scoreRange: [-100, 100],
    neutralBand: [-10, 10],
    regimes: {
      capex_expansion: "Supply momentum positive; monetization positive",
      healthy_reset: "Supply momentum negative; monetization positive",
      bubble_divergence: "Supply momentum positive; monetization negative",
      capex_downturn: "Supply momentum negative; monetization negative",
    },
    providers: {
      market: "Twelve Data adjusted daily prices",
      macro: "Federal Reserve Bank of St. Louis FRED",
    },
    principles: [
      "Point-in-time available_at timestamps",
      "Deterministic and versioned scoring",
      "Explicit missing-data coverage",
      "AI explains validated metrics but does not calculate scores",
      "The monetization axis is market-implied until reported fundamentals are connected",
    ],
    status: mode,
  };
}

function serviceUnavailable(error: string, message: string): Response {
  return json({ error, message }, { status: 503, headers: { "cache-control": "no-store" } });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({
        service: "capex-lens",
        status: "ok",
        mode: env.DATA_MODE,
        database: env.DB === undefined ? "unbound" : "bound",
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/snapshot") {
      if (env.DATA_MODE === "demo") return json(demoSnapshot);
      if (env.DB === undefined) return serviceUnavailable("d1_not_bound", "DATA_MODE is live, but the DB binding is missing.");
      const snapshot = await getLatestSnapshot(env.DB);
      if (snapshot === null) return serviceUnavailable("snapshot_not_available", "No published live snapshot exists in D1.");
      return json(snapshot, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=1800" } });
    }

    if (request.method === "GET" && url.pathname === "/api/v1/methodology") {
      return json(methodology(env.DATA_MODE), { headers: { "cache-control": "public, max-age=3600" } });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/v1/series/")) {
      if (env.DATA_MODE !== "live" || env.DB === undefined) return serviceUnavailable("series_not_available", "Metric series require live mode with a D1 binding.");
      const metricId = decodeURIComponent(url.pathname.slice("/api/v1/series/".length));
      if (!metricId || metricId.length > 128) return json({ error: "invalid_metric_id" }, { status: 400 });
      const limit = Number(url.searchParams.get("limit") ?? "500");
      const points = await getMetricSeries(env.DB, metricId, Number.isFinite(limit) ? limit : 500);
      return json({ metricId, points });
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
