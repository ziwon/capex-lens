import { demoSnapshot } from "@capex-lens/shared";

interface Env {
  ASSETS: Fetcher;
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

function methodology(): object {
  return {
    version: "0.1.0",
    scoreRange: [-100, 100],
    neutralBand: [-10, 10],
    regimes: {
      capex_expansion: "Supply momentum positive; monetization positive",
      healthy_reset: "Supply momentum negative; monetization positive",
      bubble_divergence: "Supply momentum positive; monetization negative",
      capex_downturn: "Supply momentum negative; monetization negative",
    },
    principles: [
      "Point-in-time available_at timestamps",
      "Deterministic and versioned scoring",
      "Explicit missing-data coverage",
      "AI explains validated metrics but does not calculate scores",
    ],
    status: "demo",
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ service: "capex-lens", status: "ok", mode: env.DATA_MODE, timestamp: new Date().toISOString() });
    }
    if (request.method === "GET" && url.pathname === "/api/v1/snapshot") {
      if (env.DATA_MODE !== "demo") {
        return json({ error: "live_mode_not_configured", message: "D1 and live providers have not been enabled for this scaffold." }, { status: 503 });
      }
      return json(demoSnapshot);
    }
    if (request.method === "GET" && url.pathname === "/api/v1/methodology") {
      return json(methodology(), { headers: { "cache-control": "public, max-age=3600" } });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
