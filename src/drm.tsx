import { useEffect, useRef, useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import { drmRequest } from "./drm-client";
import { errorMessage } from "./feedback";
import "./drm.css";
import { useAccess } from "./access";
import { DrmDetails } from "./drm-details";
import { RefreshCw, Loader2, ShieldCheck } from "@/lib/icons";
type RecordData = Record<string, any>;
const tabs = [
  "licenses",
  "products",
  "customers",
  "validations",
  "requests",
  "audit",
  "BuiltByBit",
] as const;
type Tab = (typeof tabs)[number];
const columns: Record<string, string[]> = {
  licenses: [
    "key_hint",
    "product_id",
    "customer_id",
    "status",
    "max_ips",
    "expires_at",
    "last_validated_at",
  ],
  products: ["name", "slug", "active", "bbb_resource_id", "bbb_validation_enabled", "retire_at"],
  customers: ["name", "email", "created_at"],
  validations: ["valid", "reason", "license_id", "ip_address", "validated_at", "request_id"],
  requests: ["method", "route", "status_code", "duration_ms", "logged_at", "request_id"],
  audit: [
    "action",
    "entity_type",
    "entity_id",
    "actor",
    "changed_fields",
    "logged_at",
    "request_id",
  ],
};
const title = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const value = (v: unknown) =>
  v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
export function Drm() {
  const access = useAccess();
  const allowedTabs = tabs.filter((t) => access.can(t === "BuiltByBit" ? "drm_sync" : `drm_${t}`));
  const [tab, setTab] = useState<Tab>(() => allowedTabs[0] || "licenses"),
    [rows, setRows] = useState<RecordData[]>([]);
  const [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<RecordData | null>(null),
    [secret, setSecret] = useState("");
  const [detail, setDetail] = useState<unknown>(null),
    [filter, setFilter] = useState("");
  const cache = useRef(new Map<string, RecordData[]>());
  const pending = useRef(new Set<string>());
  const [loadedKey, setLoadedKey] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [source, setSource] = useState(() => { try { return ["auto", "supabase", "api"].includes(sessionStorage.getItem("drm-source") || "") ? sessionStorage.getItem("drm-source")! : "auto"; } catch { return "auto"; } });
  const [extraFilters, setExtraFilters] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
  const [readInfo, setReadInfo] = useState<{
    source?: string;
    filtered_locally?: boolean;
    page_size?: number;
    count?: number;
  }>({});
  const filterKey = JSON.stringify(appliedFilters);
  const queryKey = `${source}:${tab}:${offset}:${filter}:${filterKey}`;
  const visibleRows = loadedKey === queryKey ? rows : cache.current.get(queryKey) || [];
  const [resourceIds, setResourceIds] = useState(""),
    [sync, setSync] = useState<RecordData | null>(null);
  useEffect(() => {
    let active = true;
    const cached = cache.current.get(queryKey);
    if (cached) {
      setRows(cached);
      setLoadedKey(queryKey);
    }
    setError("");
    setLoading(true);
    if (tab === "BuiltByBit") {
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ limit: "20", offset: String(offset) });
    if (filter && tab === "licenses") params.set("product_id", filter);
    if (filter && tab === "validations") params.set("license_id", filter);
    for (const [key, value] of Object.entries(appliedFilters)) if (value) params.set(key, value);
    void drmRequest(`${tab}?${params}`, "GET", undefined, source)
      .then((r) => {
        if (active) {
          cache.current.set(queryKey, r.data);
          setRows(r.data);
          setLoadedKey(queryKey);
          setUpdatedAt(new Date());
          setReadInfo(r);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, offset, refresh, filter, queryKey, source, filterKey]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && !busy && !editing && tab !== "BuiltByBit") setRefresh((n) => n + 1);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [busy, editing, tab]);
  function preload(next: Tab) {
    if (next === "BuiltByBit" || busy) return;
    const key = `${source}:${next}:0::${JSON.stringify({})}`;
    if (cache.current.has(key) || pending.current.has(key)) return;
    pending.current.add(key);
    void drmRequest(`${next}?limit=20&offset=0`, "GET", undefined, source)
      .then((result) => cache.current.set(key, result.data))
      .catch(() => {})
      .finally(() => pending.current.delete(key));
  }
  useEffect(() => {
    if (!allowedTabs.includes(tab)) {
      setTab(allowedTabs[0] || "licenses");
      setRows([]);
      cache.current.clear();
      setDetail(null);
      setEditing(null);
    }
  }, [access.admin, access.enabled, JSON.stringify(access.grants), tab]);
  async function run(action: () => Promise<any>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      cache.current.clear();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const body: RecordData = {};
      for (const [name, raw] of form.entries()) {
        const text = String(raw);
        if (name === "metadata") {
          body[name] = JSON.parse(text || "{}");
          if (!body[name] || Array.isArray(body[name]) || typeof body[name] !== "object")
            throw new Error("Metadata must be a JSON object.");
        } else if (["active", "bbb_validation_enabled"].includes(name))
          body[name] = text === "" ? null : text === "true";
        else if (["max_ips", "bbb_resource_id"].includes(name))
          body[name] = text === "" ? null : Number(text);
        else if (["retire_at", "expires_at"].includes(name))
          body[name] = text ? new Date(text).toISOString() : null;
        else body[name] = text || null;
      }
      const result = await drmRequest(
        editing?.id ? `${tab}/${editing.id}` : tab,
        editing?.id ? "PATCH" : "POST",
        body,
      );
      if (result.license_key) setSecret(result.license_key);
      setEditing(null);
      setRefresh((n) => n + 1);
      setNotice("Saved successfully.");
    });
  }
  const editable =
    ["licenses", "products", "customers"].includes(tab) && access.can(`drm_${tab}`, "edit");
  const canManage = access.can(tab === "BuiltByBit" ? "drm_sync" : `drm_${tab}`, "manage");
  const fields =
    tab === "products"
      ? [
          "name",
          "slug",
          "active",
          "bbb_resource_id",
          "bbb_validation_enabled",
          "retire_at",
          "metadata",
        ]
      : tab === "customers"
        ? ["name", "email", "metadata"]
        : [
            ...(editing?.id ? [] : ["product_id"]),
            "customer_id",
            "status",
            "max_ips",
            "expires_at",
            "metadata",
          ];
  const filterFields: Array<{ key: string; label: string; values?: string[]; type?: string }> = [
    ...(tab === "requests"
      ? [
          { key: "method", label: "HTTP method", values: ["GET", "POST", "PATCH", "DELETE"] },
          {
            key: "status_code",
            label: "HTTP status",
            values: ["200", "201", "400", "401", "403", "404", "409", "429", "500", "503"],
          },
          { key: "route", label: "Route" },
          { key: "request_id", label: "Request UUID" },
        ]
      : []),
    ...(tab === "validations"
      ? [
          { key: "valid", label: "Outcome", values: ["true", "false"] },
          { key: "reason", label: "Reason" },
          { key: "product_id", label: "Product UUID" },
          { key: "request_id", label: "Request UUID" },
        ]
      : []),
    ...(tab === "licenses"
      ? [
          { key: "status", label: "License status", values: ["active", "suspended", "revoked"] },
          { key: "customer_id", label: "Customer UUID" },
        ]
      : []),
    ...(tab === "products"
      ? [
          { key: "active", label: "Product state", values: ["true", "false"] },
          { key: "bbb_validation_enabled", label: "BBB validation", values: ["true", "false"] },
        ]
      : []),
    ...(tab === "audit"
      ? [
          {
            key: "entity_type",
            label: "Entity type",
            values: ["product", "customer", "license", "ip_binding", "bbb_sync"],
          },
          { key: "action", label: "Action" },
          { key: "entity_id", label: "Entity UUID" },
          { key: "request_id", label: "Request UUID" },
        ]
      : []),
    { key: "search", label: "Search" },
    { key: "from", label: "From date (UTC)", type: "date" },
    { key: "to", label: "Through date (UTC)", type: "date" },
  ];
  return (
    <div className="drm-workspace">
      <div className="card-heading">
        <div>
          <span className="workspace-kicker">STUDIO / ACCESS CONTROL</span>
          <h1>DRM & licensing</h1>
          <p>Manage access to your ZCraft and BuiltByBit products.</p>
        </div>
        <span className="count-pill">
          <ShieldCheck className="size-4" /> Standalone API
        </span>
      </div>
      <div className="drm-actions">
        <Field label="Load DRM records from">
          <select
            className={inputClass}
            value={source}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value);
              try { sessionStorage.setItem("drm-source", e.target.value); } catch { /* Storage may be disabled. */ }
              setOffset(0);
              cache.current.clear();
              setReadInfo({});
            }}
          >
            <option value="auto">Auto · prefer Supabase</option>
            <option value="supabase">Supabase database</option>
            <option value="api">Licensing API</option>
          </select>
        </Field>
        <span className="readonly-label">
          {readInfo.source
            ? `Reading through ${readInfo.source === "supabase" ? "Supabase" : "the licensing API"}. `
            : ""}
          License changes use the API.
        </span>
      </div>
      <nav className="drm-tabs" aria-label="Licensing sections">
        {allowedTabs.map((t) => (
          <button
            key={t}
            onPointerEnter={() => preload(t)}
            onFocus={() => preload(t)}
            aria-current={t === tab ? "page" : undefined}
            disabled={busy}
            onClick={() => {
              setTab(t);
              setOffset(0);
              setFilter("");
              setEditing(null);
              setDetail(null);
              setNotice("");
              setExtraFilters({});
              setAppliedFilters({});
            }}
          >
            {title(t)}
          </button>
        ))}
      </nav>
      <div className="drm-status" role="status" aria-live="polite">
        {loading || busy ? (
          <>
            <Loader2 className="spin size-4" />
            {busy
              ? "Processing your request…"
              : visibleRows.length
                ? "Refreshing in the background…"
                : "Connecting to the licensing server…"}
          </>
        ) : (
          <>
            <span className="drm-status-dot" />
            {updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Ready"}
          </>
        )}
        <span>Refreshes every minute</span>
      </div>
      {error && (
        <p className="drm-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {secret && (
        <section className="workspace-card drm-secret">
          <h2>Save this license key</h2>
          <p>This key is shown only once. Store it before dismissing.</p>
          <code>{secret}</code>
          <div className="drm-actions">
            <Button
              onClick={() =>
                void run(async () => {
                  await navigator.clipboard.writeText(secret);
                  setNotice("Key copied.");
                })
              }
            >
              Copy key
            </Button>
            <Button tone="paper" onClick={() => setSecret("")}>
              I have saved it
            </Button>
          </div>
        </section>
      )}
      {tab === "BuiltByBit" ? (
        <section className="workspace-card drm-form">
          <h2>Sync your resource catalog</h2>
          <p>Preview changes first. Leave IDs empty to sync all owned resources.</p>
          <Field label="Resource IDs">
            <input
              className={inputClass}
              value={resourceIds}
              onChange={(e) => {
                setResourceIds(e.target.value);
                setSync(null);
              }}
              placeholder="123, 456"
            />
          </Field>
          <div className="drm-actions">
            {[true, false].map((preview) => (
              <Button
                key={String(preview)}
                disabled={busy || !canManage || (!preview && !sync?.preview)}
                tone={preview ? "paper" : "primary"}
                onClick={() =>
                  void run(async () => {
                    const ids = resourceIds.trim()
                      ? resourceIds.split(",").map((x) => Number(x.trim()))
                      : null;
                    if (
                      ids &&
                      (ids.length > 100 || ids.some((x) => !Number.isSafeInteger(x) || x <= 0))
                    )
                      throw new Error("Enter 1–100 positive resource IDs.");
                    if (
                      !preview &&
                      !window.confirm("Apply the catalog sync? Existing product names may change.")
                    )
                      return;
                    const result = await drmRequest("bbb/sync-products", "POST", {
                      ...(ids ? { resource_ids: ids } : { all: true }),
                      preview,
                    });
                    setSync(result.data);
                  })
                }
              >
                {preview ? "Preview sync" : "Apply sync"}
              </Button>
            ))}
            {sync?.retry_resource_ids?.length > 0 && (
              <Button
                disabled={busy || !canManage}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm("Retry the failed resource imports?")) return;
                    setSync(
                      (
                        await drmRequest("bbb/sync-products/retry", "POST", {
                          sync_id: sync?.sync_id,
                          preview: false,
                        })
                      ).data,
                    );
                  })
                }
              >
                Retry failed imports
              </Button>
            )}
          </div>
          {sync && (
            <>
              <p role="status">
                {sync.complete ? "Sync complete" : "Some resources need attention"}
                {sync.preview ? " · Preview only" : ""}
              </p>
              <pre>{JSON.stringify(sync, null, 2)}</pre>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="drm-actions">
            <Button
              tone="paper"
              disabled={loading || busy}
              onClick={() => setRefresh((n) => n + 1)}
            >
              <RefreshCw className={`size-4 ${loading ? "spin" : ""}`} /> Refresh
            </Button>
            {editable && (
              <Button disabled={busy || !!secret} onClick={() => setEditing({})}>
                Create {tab.slice(0, -1)}
              </Button>
            )}
            {["licenses", "validations"].includes(tab) && (
              <Field
                label={tab === "licenses" ? "Filter by product UUID" : "Filter by license UUID"}
              >
                <input
                  className={inputClass}
                  key={tab}
                  defaultValue={filter}
                  placeholder="All records"
                  onBlur={(e) => {
                    setFilter(e.target.value.trim());
                    setOffset(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setFilter(e.currentTarget.value.trim());
                      setOffset(0);
                    }
                  }}
                />
              </Field>
            )}
          </div>
          <details className="filter-disclosure" key={tab}>
          <summary>Filter records <span>{Object.values(appliedFilters).filter(Boolean).length || ""}</span></summary>
          <form
            className="page-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedFilters({ ...extraFilters });
              setOffset(0);
            }}
          >
            {filterFields.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.values ? (
                  <select
                    value={extraFilters[f.key] || ""}
                    onChange={(e) => setExtraFilters({ ...extraFilters, [f.key]: e.target.value })}
                  >
                    <option value="">All</option>
                    {f.values.map((v) => (
                      <option key={v} value={v}>
                        {title(v)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type || "text"}
                    value={extraFilters[f.key] || ""}
                    onChange={(e) => setExtraFilters({ ...extraFilters, [f.key]: e.target.value })}
                    placeholder={f.key === "search" ? "Search records…" : undefined}
                  />
                )}
              </label>
            ))}
            <Button disabled={busy}>Apply filters</Button>
            <button
              type="button"
              onClick={() => {
                setExtraFilters({});
                setAppliedFilters({});
                setFilter("");
                setOffset(0);
              }}
            >
              Clear filters
            </button>
          </form>
          </details>
          {readInfo.filtered_locally && (
            <p className="readonly-label" role="status">
              The API supports fewer filters. These extra filters apply to the current API page
              only; switch to Supabase to filter the complete history.
            </p>
          )}
          {editing && (
            <section className="workspace-card" key={editing.id || "new"}>
              <h2>
                {editing.id ? "Edit" : "Create"} {tab.slice(0, -1)}
              </h2>
              <form className="drm-form" onSubmit={save}>
                {fields.map((name) => (
                  <Field
                    key={name}
                    label={title(name)}
                    hint={
                      name === "max_ips"
                        ? "Leave empty for unlimited IPs."
                        : name === "retire_at"
                          ? "Cached retirement policies cannot be revoked after issue."
                          : undefined
                    }
                  >
                    {name === "metadata" ? (
                      <textarea
                        className={inputClass}
                        name={name}
                        defaultValue={JSON.stringify(editing[name] || {}, null, 2)}
                        rows={4}
                      />
                    ) : ["active", "bbb_validation_enabled", "status"].includes(name) ? (
                      <select
                        className={inputClass}
                        name={name}
                        defaultValue={String(
                          editing[name] ??
                            (name === "active" ? true : name === "status" ? "active" : ""),
                        )}
                      >
                        {(name === "status"
                          ? ["active", "suspended", "revoked"]
                          : name === "active"
                            ? ["true", "false"]
                            : ["", "true", "false"]
                        ).map((v) => (
                          <option key={v} value={v}>
                            {v === "" ? "Use server default" : title(v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        name={name}
                        required={["name", "slug", "product_id"].includes(name)}
                        type={
                          ["max_ips", "bbb_resource_id"].includes(name)
                            ? "number"
                            : name.endsWith("_at")
                              ? "datetime-local"
                              : name === "email"
                                ? "email"
                                : "text"
                        }
                        min={1}
                        max={name === "max_ips" ? 10000 : undefined}
                        maxLength={name === "slug" ? 80 : name === "name" ? 200 : undefined}
                        defaultValue={
                          name.endsWith("_at") && editing[name]
                            ? new Date(
                                new Date(editing[name]).getTime() -
                                  new Date(editing[name]).getTimezoneOffset() * 60000,
                              )
                                .toISOString()
                                .slice(0, 16)
                            : (editing[name] ?? "")
                        }
                      />
                    )}
                  </Field>
                ))}
                <div className="drm-actions">
                  <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                  <Button
                    type="button"
                    tone="paper"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </section>
          )}
          <section className="workspace-card drm-table-wrap" aria-busy={loading}>
            {loading && !visibleRows.length ? (
              <div className="workspace-skeleton" role="status" aria-label={`Loading ${tab}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} />
                ))}
                <p>The server may take a moment to respond.</p>
              </div>
            ) : visibleRows.length ? (
              <table className="drm-table">
                <thead>
                  <tr>
                    {columns[tab].map((c) => (
                      <th key={c}>{title(c)}</th>
                    ))}
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id}>
                      {columns[tab].map((c) => (
                        <td key={c} title={value(r[c])}>
                          {["status", "valid", "active", "status_code"].includes(c) ? (
                            <span
                              className={`drm-badge ${r[c] === true || r[c] === "active" || (c === "status_code" && r[c] >= 200 && r[c] < 300) ? "is-positive" : "is-neutral"}`}
                            >
                              {value(r[c])}
                            </span>
                          ) : c.endsWith("_at") && r[c] ? (
                            new Date(r[c]).toLocaleString()
                          ) : (
                            value(r[c])
                          )}
                        </td>
                      ))}
                      <td>
                        <div className="drm-row-actions">
                          <button disabled={busy} onClick={() => setDetail(r)}>
                            View
                          </button>
                          {editable && (
                            <>
                              <button disabled={busy || !!secret} onClick={() => setEditing(r)}>
                                Edit
                              </button>
                              <button
                                disabled={busy || !canManage}
                                onClick={() =>
                                  void run(async () => {
                                    if (
                                      !window.confirm(
                                        `Delete this ${tab.slice(0, -1)} permanently?`,
                                      )
                                    )
                                      return;
                                    await drmRequest(`${tab}/${r.id}`, "DELETE");
                                    setRefresh((n) => n + 1);
                                    setNotice("Deleted.");
                                  })
                                }
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {tab === "licenses" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void run(async () =>
                                    setDetail(
                                      (
                                        await drmRequest(
                                          `licenses/${r.id}/ips?limit=100`,
                                          "GET",
                                          undefined,
                                          source,
                                        )
                                      ).data,
                                    ),
                                  )
                                }
                              >
                                IPs (first 100)
                              </button>
                              {["reset-ips", "rotate-key"].map((action) => (
                                <button
                                  key={action}
                                  disabled={busy || !!secret || !canManage}
                                  onClick={() =>
                                    void run(async () => {
                                      if (
                                        !window.confirm(
                                          action === "rotate-key"
                                            ? "Rotate the key? The old key will stop working immediately."
                                            : "Remove all IP bindings? Future validation will register IPs again.",
                                        )
                                      )
                                        return;
                                      const result = await drmRequest(
                                        `licenses/${r.id}/${action}`,
                                        "POST",
                                      );
                                      if (result.license_key) setSecret(result.license_key);
                                      setRefresh((n) => n + 1);
                                      setNotice(
                                        action === "reset-ips"
                                          ? `Removed ${result.data.removed} IP bindings.`
                                          : "Key rotated.",
                                      );
                                    })
                                  }
                                >
                                  {title(action.replaceAll("-", " "))}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No {tab} found.</p>
            )}
          </section>
          <div className="drm-actions">
            <Button
              tone="paper"
              disabled={offset === 0 || loading || busy}
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              Previous
            </Button>
            <span>Page {offset / 20 + 1}</span>
            <Button
              tone="paper"
              disabled={(readInfo.page_size ?? visibleRows.length) < 20 || loading || busy}
              onClick={() => setOffset((n) => n + 20)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {detail !== null && <DrmDetails data={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
