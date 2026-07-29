import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { demoSnapshot, type DashboardSnapshot } from "@capex-lens/shared";

function validateSnapshot(snapshot: DashboardSnapshot): void {
  const scores = [snapshot.axes.supply.score, snapshot.axes.monetization.score, snapshot.axes.macro.score];
  if (scores.some((score) => !Number.isFinite(score) || score < -100 || score > 100)) {
    throw new Error("Axis scores must be finite values between -100 and 100");
  }
  if (snapshot.confidence < 0 || snapshot.confidence > 1) throw new Error("Confidence must be between 0 and 1");
  const knownMetricIds = new Set(snapshot.indicators.map((indicator) => indicator.id));
  const missing = snapshot.report.sourceMetricIds.filter((metricId) => !knownMetricIds.has(metricId));
  if (missing.length > 0) throw new Error(`Report references unknown metrics: ${missing.join(", ")}`);
}

async function main(): Promise<void> {
  validateSnapshot(demoSnapshot);
  const outputDirectory = resolve(".data");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, "demo-snapshot.json");
  await writeFile(outputPath, `${JSON.stringify(demoSnapshot, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "demo_snapshot_validated", outputPath, regime: demoSnapshot.regime, indicatorCount: demoSnapshot.indicators.length }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
