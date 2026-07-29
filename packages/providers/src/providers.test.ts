import { describe, expect, it } from "vitest";
import type { RawPayload } from "./index";
import { FredProvider } from "./fred";
import { TwelveDataProvider } from "./twelve-data";

describe("live data providers", () => {
  it("normalizes a Twelve Data daily response and removes the key from provenance", async () => {
    const raw: RawPayload[] = [];
    const provider = new TwelveDataProvider({
      apiKey: "secret",
      requestWindowMs: 0,
      fetchImpl: async () => new Response(JSON.stringify({
        meta: { symbol: "SOXX", currency: "USD", exchange_timezone: "America/New_York" },
        values: [
          { datetime: "2026-07-28", open: "300", high: "310", low: "295", close: "305", volume: "1000" },
          { datetime: "2026-07-29", open: "305", high: "308", low: "290", close: "294", volume: "1200" },
        ],
        status: "ok",
      }), { status: 200 }),
      rawSink: (payload) => { raw.push(payload); },
    });

    const bars = await provider.getDailyBars(["SOXX"], "2026-07-28", "2026-07-29");
    expect(bars).toHaveLength(2);
    expect(bars[1]?.adjustedClose).toBe(294);
    expect(bars[1]?.provenance.availableAt).toBe("2026-07-29T22:00:00Z");
    expect(bars[1]?.provenance.sourceLocator).not.toContain("secret");
    expect(raw).toHaveLength(1);
    expect(raw[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalizes FRED observations and ignores missing values", async () => {
    const provider = new FredProvider({
      apiKey: "fred-secret",
      fetchImpl: async () => new Response(JSON.stringify({
        units: "Percent",
        observations: [
          { realtime_start: "2026-07-30", realtime_end: "2026-07-30", date: "2026-07-28", value: "2.40" },
          { realtime_start: "2026-07-30", realtime_end: "2026-07-30", date: "2026-07-29", value: "." },
        ],
      }), { status: 200 }),
    });

    const observations = await provider.getSeries(["DFII10"], "2026-07-28", "2026-07-29");
    expect(observations).toHaveLength(1);
    expect(observations[0]?.value).toBe(2.4);
    expect(observations[0]?.unit).toBe("Percent");
    expect(observations[0]?.provenance.availableAt).toBe("2026-07-29T23:59:59Z");
    expect(observations[0]?.provenance.sourceLocator).not.toContain("fred-secret");
  });
});
