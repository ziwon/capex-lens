import type { DashboardSnapshot, TrendPoint } from "@capex-lens/shared";

export async function fetchSnapshot(signal?: AbortSignal): Promise<DashboardSnapshot> {
  const init: RequestInit = { headers: { Accept: "application/json" } };
  if (signal) init.signal = signal;
  const response = await fetch("/api/v1/snapshot", init);
  if (!response.ok) throw new Error(`Snapshot request failed with status ${response.status}`);
  return response.json() as Promise<DashboardSnapshot>;
}

export function formatSigned(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function linePath(points: TrendPoint[], key: "supply" | "monetization", width: number, height: number): string {
  if (points.length === 0) return "";
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  const y = (value: number) => ((100 - value) / 200) * height;
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${index * step} ${y(point[key])}`).join(" ");
}
