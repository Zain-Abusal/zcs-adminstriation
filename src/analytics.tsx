import { useEffect, useId, useState } from "react";
import { ArrowRight, RefreshCw, Gauge } from "@/lib/icons";
import { db, requireAccess } from "./client";
import { errorMessage } from "./feedback";
import { dateRange, summarize, type AnalyticsRow } from "./analytics-model";

const format = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(n);
export function Analytics({
  name,
  compact = false,
}: {
  name: "page_view_daily" | "blog_reads";
  compact?: boolean;
}) {
  const blog = name === "blog_reads";
  const [days, setDays] = useState(compact ? 14 : 30),
    [bots, setBots] = useState(false),
    [metric, setMetric] = useState<"views" | "minutes">("views"),
    [rows, setRows] = useState<AnalyticsRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [partial, setPartial] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        await requireAccess(name);
        const { start, end } = dateRange(days);
        const all: AnalyticsRow[] = [];
        let capped = false;
        for (let offset = 0; offset < 10000; offset += 1000) {
          let query = db!
            .from(name)
            .select(
              blog ? "day,slug,opens,read_seconds,scroll_pct,is_bot" : "day,path,pageviews,is_bot",
            )
            .gte("day", start)
            .lte("day", end)
            .order("day", { ascending: true });
          if (!bots) query = query.eq("is_bot", false);
          if (blog) query = query.order("reader_id").order("slug");
          else
            for (const column of [
              "path",
              "source",
              "source_detail",
              "device_type",
              "country",
              "is_bot",
            ])
              query = query.order(column);
          const { data, error } = await query
            .range(offset, offset + 999)
            .abortSignal(controller.signal);
          if (error) throw error;
          if (!active) return;
          all.push(...(data || []));
          if (!data || data.length < 1000) break;
          if (offset === 9000) capped = true;
        }
        if (active) {
          setRows(all);
          setPartial(capped);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [name, days, bots, refresh, blog]);
  const summary = summarize(rows, days, blog ? "blog" : "pages");
  return (
    <section className={`analytics-section ${compact ? "analytics-compact" : ""}`}>
      {!compact && (
        <div className="page-heading">
          <div>
            <span className="workspace-kicker">INSIGHTS</span>
            <h1>{blog ? "Article engagement" : "Page traffic"}</h1>
            <p>
              {blog
                ? "See which stories get read, and how deeply readers engage."
                : "Understand how people discover and explore your website."}
            </p>
          </div>
        </div>
      )}
      <div className="analytics-controls">
        <div className="segmented" aria-label="Date range">
          {[7, 14, 30, 90].map((n) => (
            <button type="button" key={n} aria-pressed={days === n} onClick={() => setDays(n)}>
              {n} days
            </button>
          ))}
        </div>
        <div>
          <label className="analytics-bots">
            <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} />
            Include bots
          </label>
          <button
            className="icon-button"
            aria-label="Refresh analytics"
            disabled={loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>
      {error ? (
        <div className="workspace-error" role="alert">
          {error}
          <button onClick={() => setRefresh((n) => n + 1)}>Try again</button>
        </div>
      ) : (
        <>
          {!compact && (
            <div className="metric-grid analytics-metrics">
              {(blog
                ? [
                    ["Article opens", format(summary.total)],
                    ["Reading time", `${format(summary.seconds / 60)} min`],
                    ["Average scroll", `${Math.round(summary.scroll)}%`],
                    ["Articles read", format(summary.distinct)],
                  ]
                : [
                    ["Total page views", format(summary.total)],
                    ["Daily average", format(summary.average)],
                    ["Pages visited", format(summary.distinct)],
                    ["Date range", `${days} days`],
                  ]
              ).map(([text, value]) => (
                <div className="metric-card" key={text}>
                  <span className="metric-label">{text}</span>
                  <strong>{loading ? "…" : value}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="workspace-card chart-card">
            <div className="card-heading">
              <div>
                <h2>
                  {compact ? "Traffic snapshot" : blog ? "Reading activity" : "Views over time"}
                </h2>
                <p>{bots ? "All recorded traffic" : "Human traffic · bots excluded"} · UTC dates</p>
              </div>
              {blog ? (
                <select
                  aria-label="Chart metric"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as "views" | "minutes")}
                >
                  <option value="views">Article opens</option>
                  <option value="minutes">Reading minutes</option>
                </select>
              ) : (
                <span className="chart-legend">
                  <span />
                  Page views
                </span>
              )}
            </div>
            {loading ? (
              <div className="chart-loading" role="status">
                <div className="workspace-skeleton">
                  <div />
                  <div />
                  <div />
                </div>
              </div>
            ) : (
              <>
                <TimeChart
                  points={summary.daily}
                  metric={blog ? metric : "views"}
                  label={
                    blog ? (metric === "views" ? "Article opens" : "Reading minutes") : "Page views"
                  }
                />
                {!summary.total && (
                  <p className="chart-empty">No activity recorded in this date range.</p>
                )}
              </>
            )}
            {compact && (
              <a className="card-bottom-link" href="#page_view_daily">
                Explore traffic <ArrowRight />
              </a>
            )}
          </div>
          {!compact && (
            <div className="workspace-card analytics-ranking">
              <div className="card-heading">
                <div>
                  <h2>{blog ? "Most-read articles" : "Top pages"}</h2>
                  <p>Ranked by {blog ? "opens" : "page views"} during this period.</p>
                </div>
                <Gauge />
              </div>
              {loading ? (
                <div className="workspace-skeleton">
                  <div />
                  <div />
                </div>
              ) : summary.ranked.length ? (
                <ol>
                  {summary.ranked.map((r, i) => (
                    <li key={r.name}>
                      <span className="ranking-number">{i + 1}</span>
                      <span className="ranking-name">
                        <strong>{r.name}</strong>
                        <span className="ranking-track">
                          <span
                            style={{
                              width: `${(r.value / (summary.ranked[0]?.value || 1)) * 100}%`,
                            }}
                          />
                        </span>
                      </span>
                      <strong>{format(r.value)}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="chart-empty">Nothing to rank yet.</p>
              )}
            </div>
          )}
          {partial && (
            <p className="workspace-error" role="status">
              Showing the first 10,000 records. Choose a shorter period for complete totals.
            </p>
          )}
          {!compact && (
            <p className="collection-footnote">
              {blog
                ? "Average scroll is weighted by article opens. Reading time can include repeat visits."
                : "Views count visits, not unique people."}{" "}
              These are consent-based analytics, so they do not represent every visit.
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function TimeChart({
  points,
  metric,
  label,
  precision = 0,
}: {
  points: Array<{ day: string; views: number; minutes: number }>;
  metric: "views" | "minutes";
  label: string;
  precision?: number;
}) {
  const chartFormat = (value: number) =>
    new Intl.NumberFormat("en", { maximumFractionDigits: precision }).format(value);
  const id = useId().replaceAll(":", "");
  const [focused, setFocused] = useState<number | null>(null);
  const width = 900,
    height = 230,
    left = 48,
    right = 20,
    top = 20,
    bottom = 35;
  const max = Math.max(1, ...points.map((p) => p[metric]));
  const roundedMax = Math.max(1, Math.ceil(max / 5) * 5);
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const coords = points.map((p, i) => ({
    x: left + (i / Math.max(points.length - 1, 1)) * plotWidth,
    y: top + plotHeight - (p[metric] / roundedMax) * plotHeight,
    p,
  }));
  const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x},${c.y}`).join(" ");
  const first = coords[0],
    last = coords.at(-1);
  const active = focused === null ? null : coords[focused];
  return (
    <div className="time-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`chart-title-${id}`}>
        <title id={`chart-title-${id}`}>{label} per day. Focus a point for its value.</title>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3eb59d" stopOpacity=".18" />
            <stop offset="100%" stopColor="#3eb59d" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={width - right}
              y1={top + plotHeight * f}
              y2={top + plotHeight * f}
              stroke="#edf1ee"
              strokeDasharray="3 5"
            />
            <text
              x={left - 12}
              y={top + plotHeight * f + 3}
              textAnchor="end"
              className="chart-axis"
            >
              {chartFormat(roundedMax * (1 - f))}
            </text>
          </g>
        ))}
        {first && last && (
          <path
            d={`${path} L${last.x},${top + plotHeight} L${first.x},${top + plotHeight} Z`}
            fill={`url(#fill-${id})`}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke="#37a88f"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords
          .filter(
            (_, i) => i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 6) === 0,
          )
          .map((c) => (
            <text key={c.p.day} x={c.x} y={height - 10} textAnchor="middle" className="chart-axis">
              {new Date(c.p.day + "T00:00:00Z").toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </text>
          ))}
        {coords.map((c, i) => (
          <circle
            key={c.p.day}
            cx={c.x}
            cy={c.y}
            r={focused === i ? 5 : 4}
            fill={focused === i ? "#218b72" : "transparent"}
            stroke={focused === i ? "white" : "transparent"}
            strokeWidth="2"
            tabIndex={i === (focused ?? coords.length - 1) ? 0 : -1}
            role="img"
            aria-label={`${c.p.day}: ${chartFormat(c.p[metric])} ${label}`}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? coords.length - 1
                    : Math.max(
                        0,
                        Math.min(coords.length - 1, i + (event.key === "ArrowLeft" ? -1 : 1)),
                      );
              const point = event.currentTarget.parentElement?.querySelectorAll("circle")[next];
              point?.focus();
            }}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            onMouseEnter={() => setFocused(i)}
            onMouseLeave={() => setFocused(null)}
          >
            <title>
              {c.p.day}: {chartFormat(c.p[metric])} {label}
            </title>
          </circle>
        ))}
      </svg>
      <div className="chart-tooltip" aria-live="polite">
        {active
          ? `${active.p.day} · ${chartFormat(active.p[metric])} ${label.toLowerCase()}`
          : "Hover a point, or focus the chart and use arrow keys"}
      </div>
    </div>
  );
}
