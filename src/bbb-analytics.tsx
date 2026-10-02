import { useEffect, useState } from "react";
import { db } from "./client";
import { errorMessage } from "./feedback";
import { TimeChart } from "./analytics";
import { RefreshCw, ArrowRight } from "@/lib/icons";
import { BbbSelect } from "./bbb-select";
import {
  buildBbbQuery,
  humanize,
  groupingLabel,
  normalizeDefinitions,
  periodLabels,
  type BbbDefinition,
} from "./bbb-analytics-model";
type Product = { id: string; name: string; purchases: number };
type Period = { period_display: string; start_date: string; end_date: string };
type Graph = {
  data: Record<string, { ts: number; values: Record<string, number> }>;
  grouping: string | { grouping: string; grouping_display?: string };
  period: Period;
};
type Totals = {
  analytics: Record<string, number | string>;
  prefixes?: Record<string, string>;
  suffixes?: Record<string, string>;
  period: Period;
};
async function request(params: URLSearchParams, signal: AbortSignal) {
  const session = await db?.auth.getSession();
  let token = session?.data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const send = (token: string) =>
    fetch(`/api/bbb-analytics?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
      cache: "no-store",
    });
  let response = await send(token);
  if (response.status === 401) {
    const refreshed = await db!.auth.refreshSession();
    token = refreshed.data.session?.access_token;
    if (!token || refreshed.error) throw new Error("Please sign in again.");
    response = await send(token);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to load BuiltByBit analytics.");
  return result;
}
export function BbbAnalytics() {
  const [definitions, setDefinitions] = useState<Record<string, BbbDefinition>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [soldOnly, setSoldOnly] = useState(true);
  const [catalogNote, setCatalogNote] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [metric, setMetric] = useState("");
  const [period, setPeriod] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today),
    [end, setEnd] = useState(today);
  const [graph, setGraph] = useState<Graph | null>(null),
    [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [init, setInit] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState<URLSearchParams | null>(null);
  const definition = definitions[metric];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCatalogLoading(true);
    setError("");
    void request(new URLSearchParams({ operation: "definitions" }), controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const defs = normalizeDefinitions(data);
        const initial = Object.hasOwn(defs, "resources-base-total-revenue")
          ? "resources-base-total-revenue"
          : Object.keys(defs)[0];
        setDefinitions(defs);
        if (!initial) {
          setLoading(false);
          return;
        }
        const initialPeriod = defs[initial].periods?.includes("past_thirty_days")
          ? "past_thirty_days"
          : defs[initial].periods?.[0] || "";
        setMetric(initial);
        setPeriod(initialPeriod);
        setFilters({});
        if (initialPeriod && initialPeriod !== "custom_range")
          setQuery(buildBbbQuery(initial, initialPeriod, {}, "", ""));
        else setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    void request(new URLSearchParams({ operation: "products" }), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setProducts(data.products || []);
          setCatalogNote(data.warning || "");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCatalogNote("Product listing is unavailable. Enter resource IDs below to filter.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [init]);
  useEffect(() => {
    if (!query) return;
    const appliedMetric = query.get("analytics")!;
    const appliedDefinition = definitions[appliedMetric];
    if (!appliedDefinition) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const get = (operation: string) => {
      const params = new URLSearchParams(query);
      params.set("operation", operation);
      return request(params, controller.signal);
    };
    Promise.all([
      appliedDefinition.graph ? get("graph") : Promise.resolve(null),
      appliedDefinition.single ? get("single") : Promise.resolve(null),
    ])
      .then(([g, s]) => {
        if (!controller.signal.aborted) {
          setGraph(g);
          setTotals(s);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, definitions, refresh]);
  const appliedMetric = query?.get("analytics") || metric;
  const appliedDefinition = definitions[appliedMetric];
  const appliedPeriod = graph?.period || totals?.period;
  const appliedIds = query?.getAll("filters[resource_ids][]") || [];
  const money =
    totals?.prefixes?.[appliedMetric] === "$" ||
    /revenue|earnings|profit|fees|cart-value/.test(appliedMetric);
  const number = (value: number) =>
    money
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
      : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
  const total = totals?.analytics?.[appliedMetric];
  const points = Object.values(graph?.data || {})
    .sort((a, b) => a.ts - b.ts)
    .map((p) => ({
      day: new Date(p.ts * 1000).toISOString().slice(0, 10),
      views: Number(p.values?.[appliedMetric] || 0),
      minutes: 0,
    }));
  const resourceKey = Object.keys(definition?.filters || {}).find((key) =>
    ["resource_ids", "resource_id"].includes(key),
  );
  const reset = () => {
    setFilters({});
    setPeriod(
      definition?.periods?.includes("past_thirty_days")
        ? "past_thirty_days"
        : definition?.periods?.[0] || "",
    );
  };
  const dirty =
    query &&
    (() => {
      try {
        return buildBbbQuery(metric, period, filters, start, end).toString() !== query.toString();
      } catch {
        return true;
      }
    })();
  return (
    <section className="analytics-section bbb-analytics">
      <div className="page-heading">
        <div>
          <span className="workspace-kicker">MARKETPLACE INSIGHTS</span>
          <h1>BuiltByBit analytics</h1>
          <p>Sales, earnings, and engagement across your products.</p>
        </div>
        <button
          className="bbb-refresh"
          disabled={loading}
          onClick={() =>
            Object.keys(definitions).length ? setRefresh((n) => n + 1) : setInit((n) => n + 1)
          }
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>
      {!!Object.keys(definitions).length && (
        <form
          className="workspace-card bbb-filters"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setQuery(buildBbbQuery(metric, period, filters, start, end));
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          <div className="bbb-filter-title">
            <div>
              <h2>Explore your performance</h2>
              <p>Choose what to measure and which products to include.</p>
            </div>
            <button type="button" className="bbb-reset" onClick={reset}>
              Reset filters
            </button>
          </div>
          <div className="bbb-filter-grid">
            <BbbSelect
              label="Metric"
              value={metric}
              options={Object.entries(definitions)
                .map(([id, d]) => ({
                  value: id,
                  label: d.label,
                  group: id.includes("-ads-")
                    ? "Advertising"
                    : id.includes("-payments-")
                      ? "Earnings"
                      : id.includes("-referrals-")
                        ? "Referrals"
                        : "Product performance",
                }))
                .sort((a, b) => a.group.localeCompare(b.group))}
              onChange={(next) => {
                setMetric(next);
                setFilters({});
                const periods = definitions[next].periods || [];
                if (!periods.includes(period))
                  setPeriod(
                    periods.includes("past_thirty_days") ? "past_thirty_days" : periods[0] || "",
                  );
              }}
            />
            <BbbSelect
              label="Period"
              value={period}
              options={(definition?.periods || []).map((p) => ({
                value: p,
                label: periodLabels[p] || humanize(p),
              }))}
              onChange={setPeriod}
              placeholder="No periods available"
            />
            {resourceKey && (
              <BbbSelect
                label="Products"
                multiple={resourceKey === "resource_ids"}
                value={filters[resourceKey] || ""}
                options={products
                  .filter((p) => !soldOnly || p.purchases > 0)
                  .map((p) => ({
                    value: p.id,
                    label: p.name,
                    detail: `BBB #${p.id}`,
                  }))}
                onChange={(value) => setFilters((f) => ({ ...f, [resourceKey]: value }))}
                placeholder={catalogLoading ? "Loading products…" : "All products"}
                disabled={catalogLoading}
              />
            )}
            {period === "custom_range" && (
              <>
                <label className="bbb-date">
                  <span className="bbb-field-label">From</span>
                  <input
                    type="date"
                    required
                    value={start}
                    max={end}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="bbb-date">
                  <span className="bbb-field-label">Through</span>
                  <input
                    type="date"
                    required
                    value={end}
                    min={start}
                    max={today}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </>
            )}
            {Object.entries(definition?.filters || {})
              .filter(([key]) => key !== resourceKey)
              .map(([key, spec]) => (
                <label className="bbb-date" key={key}>
                  <span className="bbb-field-label">{humanize(key)}</span>
                  <input
                    placeholder="All"
                    value={filters[key] || ""}
                    onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                  />
                  <small>{spec.desc}</small>
                </label>
              ))}
          </div>
          {resourceKey && products.length > 0 && (
            <label className="bbb-sales-filter">
              <input
                type="checkbox"
                checked={soldOnly}
                onChange={(event) => {
                  setSoldOnly(event.target.checked);
                  setFilters((f) => ({ ...f, [resourceKey]: "" }));
                }}
              />
              Products with sales only<small>Published products · drafts excluded</small>
            </label>
          )}
          {resourceKey && filters[resourceKey] && (
            <div className="bbb-product-chips">
              {filters[resourceKey]
                .split(",")
                .filter(Boolean)
                .map((id) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        [resourceKey]: f[resourceKey]
                          .split(",")
                          .filter((value) => value !== id)
                          .join(","),
                      }))
                    }
                  >
                    {products.find((p) => p.id === id)?.name || "Resource"}
                    <span>#{id}</span>
                    <span aria-label={`Remove resource ${id}`}>×</span>
                  </button>
                ))}
            </div>
          )}
          {resourceKey && !catalogLoading && !products.length && (
            <label className="bbb-manual">
              <span className="bbb-field-label">Resource IDs</span>
              <input
                placeholder="e.g. 12345, 67890"
                inputMode="numeric"
                value={filters[resourceKey] || ""}
                pattern="[0-9]+(,[ ]*[0-9]+)*"
                onChange={(e) =>
                  setFilters((f) => ({ ...f, [resourceKey]: e.target.value.replaceAll(" ", "") }))
                }
              />
              <small>
                {catalogNote ||
                  "No synced products found. Enter BBB resource IDs separated by commas."}
              </small>
            </label>
          )}
          {products.length > 0 && catalogNote && <p className="bbb-catalog-note">{catalogNote}</p>}
          <div className="bbb-filter-footer">
            <p>{definition?.desc}</p>
            <button type="submit" className="bbb-apply" disabled={loading || !period}>
              Apply filters
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="workspace-error" role="alert">
          {error}
          <button onClick={() => (query ? setRefresh((n) => n + 1) : setInit((n) => n + 1))}>
            Try again
          </button>
        </div>
      )}
      {dirty && (
        <p className="bbb-pending" role="status">
          Filters changed. Apply to update the results below.
        </p>
      )}
      {appliedDefinition && (
        <>
          <div className="bbb-results-heading">
            <h2>{appliedDefinition.label}</h2>
            <span>
              {appliedPeriod?.period_display ||
                periodLabels[query?.get("period") || ""] ||
                "Select a period"}{" "}
              ·{" "}
              {appliedIds.length
                ? `${appliedIds.length} product${appliedIds.length === 1 ? "" : "s"}`
                : "All products"}
            </span>
          </div>
          <div className="bbb-summary-grid">
            <div className="workspace-card bbb-total">
              <span className="metric-label">
                {appliedDefinition.single ? "Period value" : "Recorded activity"}
              </span>
              <strong>
                {loading
                  ? "…"
                  : total !== undefined
                    ? number(Number(total))
                    : graph
                      ? number(points.reduce((sum, p) => sum + p.views, 0))
                      : "—"}
              </strong>
              <span>
                {appliedDefinition.label}
                {money && " · USD"}
              </span>
            </div>
            <div className="workspace-card bbb-context">
              <span className="metric-label">Reporting window</span>
              <strong>
                {appliedPeriod
                  ? `${appliedPeriod.start_date} — ${appliedPeriod.end_date}`
                  : "Choose a period"}
              </strong>
              <span>
                {graph?.grouping
                  ? `${groupingLabel(graph.grouping)} breakdown`
                  : "BuiltByBit marketplace data"}
              </span>
            </div>
          </div>
          {appliedDefinition.graph && (
            <div className="workspace-card chart-card bbb-chart">
              <div className="card-heading">
                <div>
                  <h2>Performance over time</h2>
                  <p>
                    {appliedDefinition.label}
                    {money && " in USD"}
                  </p>
                </div>
                <span className="chart-legend">
                  <span />
                  {graph?.grouping ? groupingLabel(graph.grouping) : "Activity"}
                </span>
              </div>
              {loading ? (
                <div
                  className="chart-loading workspace-skeleton"
                  role="status"
                  aria-label="Loading analytics"
                >
                  <div />
                  <div />
                  <div />
                </div>
              ) : points.length ? (
                <TimeChart
                  points={points}
                  metric="views"
                  label={appliedDefinition.label}
                  precision={2}
                />
              ) : (
                <p className="chart-empty">
                  {graph
                    ? "No activity in this period. Try another date range or product."
                    : "Apply your filters to see the trend."}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {loading && !appliedDefinition && (
        <div className="workspace-skeleton" role="status" aria-label="Loading analytics">
          <div />
          <div />
        </div>
      )}
      {!loading && !error && !Object.keys(definitions).length && (
        <p className="chart-empty">No analytics are available for this BuiltByBit account.</p>
      )}
    </section>
  );
}
