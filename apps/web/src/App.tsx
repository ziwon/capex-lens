import { useEffect, useMemo, useState } from "react";
import {
  REGIME_META,
  demoSnapshot,
  type AxisScore,
  type BasketMember,
  type DashboardSnapshot,
  type Indicator,
} from "@capex-lens/shared";
import { fetchSnapshot, formatSigned, linePath } from "./lib";

function ScoreCard({ axis }: { axis: AxisScore }) {
  const delta = axis.score - axis.previousScore;
  const tone = axis.score >= 20 ? "positive" : axis.score <= -20 ? "negative" : "neutral";
  return (
    <article className={`score-card tone-${tone}`}>
      <div className="card-heading">
        <div><span className="eyebrow">{axis.label}</span><h2>{axis.score}</h2></div>
        <span className="delta">{formatSigned(delta, 0)} vs prior</span>
      </div>
      <div className="score-track" aria-label={`${axis.label} score ${axis.score}`}>
        <span className="score-zero" />
        <span className="score-marker" style={{ left: `${(axis.score + 100) / 2}%` }} />
      </div>
      <p>{axis.summary}</p>
      <div className="component-list">
        {axis.components.slice(0, 3).map((component) => (
          <div key={component.id}><span>{component.label}</span><strong>{component.score}</strong></div>
        ))}
      </div>
    </article>
  );
}

function RegimeMap({ snapshot }: { snapshot: DashboardSnapshot }) {
  const x = (snapshot.axes.monetization.score + 100) / 2;
  const y = (100 - snapshot.axes.supply.score) / 2;
  return (
    <article className="panel regime-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">AI CAPEX regime map</span><h2>Momentum vs monetization</h2></div>
        <span className="confidence">{Math.round(snapshot.confidence * 100)}% confidence</span>
      </div>
      <div className="regime-map" role="img" aria-label="Four quadrant AI CAPEX regime map">
        <div className="quadrant bubble"><strong>Bubble Divergence</strong><span>Momentum leads economics</span></div>
        <div className="quadrant expansion"><strong>CAPEX Expansion</strong><span>Demand and returns reinforce</span></div>
        <div className="quadrant downturn"><strong>CAPEX Downturn</strong><span>Demand and returns weaken</span></div>
        <div className="quadrant reset"><strong>Healthy Reset</strong><span>Valuation cools, economics hold</span></div>
        <span className="axis-label axis-x">Hyperscaler monetization →</span>
        <span className="axis-label axis-y">Supply-chain momentum →</span>
        <span className="regime-dot" style={{ left: `${x}%`, top: `${y}%` }} title={`${snapshot.axes.supply.score}, ${snapshot.axes.monetization.score}`} />
      </div>
    </article>
  );
}

function DivergenceChart({ snapshot }: { snapshot: DashboardSnapshot }) {
  const width = 760;
  const height = 230;
  const supplyPath = useMemo(() => linePath(snapshot.trend, "supply", width, height), [snapshot.trend]);
  const monetizationPath = useMemo(() => linePath(snapshot.trend, "monetization", width, height), [snapshot.trend]);
  return (
    <article className="panel chart-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">12-week normalized trend</span><h2>Divergence monitor</h2></div>
        <div className="legend"><span><i className="legend-supply" /> Supply</span><span><i className="legend-monetization" /> Monetization</span></div>
      </div>
      <div className="chart-shell">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Supply and monetization trend">
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="zero-line" />
          <path d={supplyPath} className="trend-line supply-line" />
          <path d={monetizationPath} className="trend-line monetization-line" />
        </svg>
        <div className="chart-labels"><span>{snapshot.trend.at(0)?.date}</span><span>{snapshot.trend.at(-1)?.date}</span></div>
      </div>
    </article>
  );
}

function IndicatorCard({ indicator }: { indicator: Indicator }) {
  return (
    <article className="indicator-card">
      <div className="indicator-topline"><span>{indicator.category}</span><span className={`signal signal-${indicator.signal}`}>{indicator.signal}</span></div>
      <h3>{indicator.label}</h3>
      <div className="indicator-value"><strong>{indicator.formattedValue}</strong><span>{indicator.changeLabel}</span></div>
      <p>{indicator.description}</p>
    </article>
  );
}

function BasketTable({ title, members }: { title: string; members: BasketMember[] }) {
  return (
    <article className="panel basket-panel">
      <div className="panel-heading"><div><span className="eyebrow">Illustrative basket</span><h2>{title}</h2></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Symbol</th><th>20D</th><th>60D</th><th>Drawdown</th></tr></thead>
          <tbody>{members.map((member) => (
            <tr key={member.symbol}>
              <td><strong>{member.symbol}</strong><span>{member.name}</span></td>
              <td className={member.return20d >= 0 ? "number-up" : "number-down"}>{formatSigned(member.return20d)}%</td>
              <td className={member.return60d >= 0 ? "number-up" : "number-down"}>{formatSigned(member.return60d)}%</td>
              <td className="number-down">{member.drawdown.toFixed(1)}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </article>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(demoSnapshot);
  const [source, setSource] = useState<"api" | "fallback">("fallback");

  useEffect(() => {
    const controller = new AbortController();
    fetchSnapshot(controller.signal)
      .then((next) => { setSnapshot(next); setSource("api"); })
      .catch(() => { setSnapshot(demoSnapshot); setSource("fallback"); });
    return () => controller.abort();
  }, []);

  const regime = REGIME_META[snapshot.regime];
  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Capex Lens home"><span className="brand-mark">C</span><span><strong>Capex Lens</strong><small>AI investment-cycle intelligence</small></span></a>
        <nav><a href="#dashboard">Dashboard</a><a href="#evidence">Evidence</a><a href="#methodology">Methodology</a></nav>
        <span className="status-pill">Private MVP</span>
      </header>

      <main>
        <section className="hero" id="dashboard">
          <div>
            <span className="eyebrow">Current research regime</span><h1>{regime.label}</h1><p>{regime.description}</p>
            <div className="hero-meta"><span>As of {snapshot.asOf}</span><span>{snapshot.coverage}% coverage</span><span>{snapshot.freshness}</span></div>
          </div>
          <div className="hero-score"><span>Divergence</span><strong>{snapshot.divergenceScore}</strong><small>Supply minus monetization</small></div>
        </section>

        <div className="demo-banner"><strong>Illustrative data only.</strong><span>{source === "api" ? "Served by the demo Worker API." : "Using the frontend fallback snapshot."} Live providers and D1 are intentionally not enabled yet.</span></div>
        <section className="score-grid"><ScoreCard axis={snapshot.axes.supply} /><ScoreCard axis={snapshot.axes.monetization} /><ScoreCard axis={snapshot.axes.macro} /></section>
        <section className="analysis-grid"><RegimeMap snapshot={snapshot} /><DivergenceChart snapshot={snapshot} /></section>
        <section className="indicator-grid" id="evidence">{snapshot.indicators.map((indicator) => <IndicatorCard key={indicator.id} indicator={indicator} />)}</section>
        <section className="basket-grid"><BasketTable title="AI supply chain" members={snapshot.baskets.supply} /><BasketTable title="Hyperscalers" members={snapshot.baskets.hyperscalers} /></section>

        <section className="brief panel">
          <div className="panel-heading"><div><span className="eyebrow">Weekly evidence brief</span><h2>{snapshot.report.headline}</h2></div><span className="confidence">Week {snapshot.report.period}</span></div>
          <p className="brief-summary">{snapshot.report.summary}</p>
          <div className="brief-columns">
            <div><h3>Primary drivers</h3><ul>{snapshot.report.primaryDrivers.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>Counter-evidence</h3><ul>{snapshot.report.counterEvidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>Watch next</h3><ul>{snapshot.report.watchNext.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          <small>{snapshot.report.disclaimer}</small>
        </section>

        <section className="methodology panel" id="methodology">
          <span className="eyebrow">Methodology principle</span><h2>Code calculates. AI explains.</h2>
          <p>Scores are deterministic, versioned, point-in-time calculations. An LLM may summarize validated changes and counter-evidence, but it never invents observations or calculates the regime. Every live value will carry freshness, coverage, and provenance metadata.</p>
        </section>
      </main>
      <footer><span>Capex Lens · private MVP</span><span>Research context only · not investment advice</span></footer>
    </div>
  );
}
