import type { RegimeInput } from "@capex-lens/indicators";
import type { DailyBar, MacroObservation, Provenance } from "@capex-lens/providers";
import type { RegimeKey } from "@capex-lens/shared";
import { describe, expect, it, vi } from "vitest";
import { buildLiveSnapshot } from "./build-snapshot";
import {
  FRED_SERIES,
  FRED_SERIES_IDS,
  HYPERSCALER_BASKET,
  MARKET_SYMBOLS,
  NASDAQ_PROXY,
  SUPPLY_BASKET,
} from "./universe";

const classifyRegimeSpy = vi.hoisted(() => vi.fn<(input: RegimeInput) => RegimeKey>());

vi.mock("@capex-lens/indicators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capex-lens/indicators")>();
  classifyRegimeSpy.mockImplementation(actual.classifyRegime);
  return { ...actual, classifyRegime: classifyRegimeSpy };
});

function tradingDates(count: number): string[] {
  const dates: string[] = [];
  const current = new Date("2024-01-02T00:00:00Z");
  while (dates.length < count) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function provenance(sourceId: string, availableAt: string): Provenance {
  return {
    provider: sourceId.startsWith("fred.") ? "fred" : "twelve-data",
    sourceId,
    sourceLocator: `https://example.test/${sourceId}`,
    fetchedAt: availableAt,
    availableAt,
    contentHash: sourceId.padEnd(64, "0").slice(0, 64),
    schemaVersion: "test.v1",
    license: "test-only synthetic data",
  };
}

function syntheticBars(dates: string[]): DailyBar[] {
  const supplySymbols = new Set(SUPPLY_BASKET.map((member) => member.symbol));
  const hyperscalerSymbols = new Set(HYPERSCALER_BASKET.map((member) => member.symbol));

  return MARKET_SYMBOLS.flatMap((symbol, symbolIndex) => {
    const groupDrift = supplySymbols.has(symbol) ? 0.09 : hyperscalerSymbols.has(symbol) ? 0.075 : 0.08;
    return dates.map((sessionDate, index) => {
      const phase = symbolIndex * 0.71;
      const cycle = Math.sin(index / 13 + phase) * 2.5 + Math.cos(index / 29 + phase) * 1.4;
      const close = 80 + symbolIndex * 4 + index * groupDrift + cycle;
      const availableAt = `${sessionDate}T22:00:00Z`;
      return {
        symbol,
        sessionDate,
        open: close * 0.997,
        high: close * 1.008,
        low: close * 0.992,
        close,
        adjustedClose: close,
        volume: 1_000_000 + symbolIndex * 10_000 + index * 100,
        currency: "USD",
        provenance: provenance("twelve-data.adjusted-daily", availableAt),
      };
    });
  });
}

function syntheticMacro(dates: string[]): MacroObservation[] {
  return FRED_SERIES_IDS.flatMap((seriesId, seriesIndex) => dates.map((observationDate, index) => {
    const base = seriesId === FRED_SERIES.realYield10y ? 1.8 : seriesId === FRED_SERIES.investmentGradeOas ? 1.1 : 3.2;
    const value = base + Math.sin(index / 17 + seriesIndex) * 0.15 + Math.cos(index / 41) * 0.05;
    const availableAt = `${observationDate}T23:00:00Z`;
    return {
      seriesId,
      observationDate,
      value,
      unit: "Percent",
      provenance: provenance(`fred.${seriesId}`, availableAt),
    };
  }));
}

describe("buildLiveSnapshot", () => {
  it("carries the previous regime through every scored date and uses the final hysteretic regime", () => {
    const dates = tradingDates(330);
    const latestDate = dates.at(-1);
    if (latestDate === undefined) throw new Error("Synthetic dates are required");
    const callOffset = classifyRegimeSpy.mock.calls.length;

    const snapshot = buildLiveSnapshot(
      syntheticBars(dates),
      syntheticMacro(dates),
      `${latestDate}T23:59:59Z`,
    );

    const calls = classifyRegimeSpy.mock.calls.slice(callOffset).map(([input]) => input);
    const results = classifyRegimeSpy.mock.results.slice(callOffset).map((result) => result.value);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0]?.previousRegime).toBeUndefined();
    for (let index = 1; index < calls.length; index += 1) {
      expect(calls[index]?.previousRegime).toBe(results[index - 1]);
    }

    expect(snapshot.regime).toBe(results.at(-1));
    expect(snapshot.axes.monetization.label).toBe("Market-implied monetization");
    expect(snapshot.mode).toBe("live");
    expect(snapshot.trend).toHaveLength(12);
  });

  it("rejects a core benchmark that does not match the snapshot as-of date", () => {
    const dates = tradingDates(330);
    const latestDate = dates.at(-1);
    if (latestDate === undefined) throw new Error("Synthetic dates are required");
    const bars = syntheticBars(dates).filter((bar) => bar.symbol !== NASDAQ_PROXY || bar.sessionDate !== latestDate);

    expect(() => buildLiveSnapshot(
      bars,
      syntheticMacro(dates),
      `${latestDate}T23:59:59Z`,
    )).toThrow(`Benchmark ${NASDAQ_PROXY} is stale`);
  });

  it("rejects benchmark data older than the configured publication limit", () => {
    const dates = tradingDates(330);
    const latestDate = dates.at(-1);
    if (latestDate === undefined) throw new Error("Synthetic dates are required");
    const generatedAt = new Date(`${latestDate}T23:59:59Z`);
    generatedAt.setUTCHours(generatedAt.getUTCHours() + 97);

    expect(() => buildLiveSnapshot(
      syntheticBars(dates),
      syntheticMacro(dates),
      generatedAt.toISOString(),
      { maxBenchmarkAgeHours: 96 },
    )).toThrow("Benchmark SOXX is stale");
  });
});
