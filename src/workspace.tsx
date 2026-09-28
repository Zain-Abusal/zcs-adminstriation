import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/kit";
import {
  Package,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Users,
  Gauge,
  ShieldCheck,
  ChevronRight,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  Menu,
  X,
  ArrowRight,
  Boxes,
  Mail,
  Eye,
  Upload,
  Tag,
} from "@/lib/icons";
import { SITE_URL } from "@/lib/site";
import { useToast } from "@/lib/toast-context";
import { db, requireAdmin } from "./client";
import { errorMessage } from "./feedback";
import { resources, label, displayValue, type Resource, type Row } from "./workspace-config";
import { searchFilter } from "./record-values";
import { RecordEditor } from "./record-editor";
import { Storage } from "./storage";
import "./workspace.css";
const primary = ["overview", "products", "custom_requests"];
const groupIcons = {
  Content: FileText,
  Catalog: Boxes,
  Community: Users,
  Insights: Gauge,
  Workspace: ShieldCheck,
};
const pageSize = 20;
function currentSection() {
  const value = window.location.hash.slice(1).split("?")[0];
  return ["overview", "storage", ...resources.map((r) => r.name)].includes(value)
    ? value
    : "overview";
}
export function Dashboard({ identity, logout }: { identity: string; logout: () => void }) {
  const [section, setSection] = useState(currentSection),
    [mobile, setMobile] = useState(false),
    [openGroup, setOpenGroup] = useState("Content");
  const [quickCreate, setQuickCreate] = useState<Resource | null>(null);
  const navigate = (name: string) => {
    window.location.hash = name;
    setMobile(false);
  };
  useEffect(() => {
    const change = () => setSection(currentSection());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const resource = resources.find((r) => r.name === section);
  useEffect(() => {
    document.title = `${resource?.label || (section === "storage" ? "Files" : "Overview")} · ZCraft Admin`;
  }, [section, resource]);
  return (
    <div className="studio-workspace workspace-shell">
      {mobile && (
        <button
          className="mobile-nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`studio-sidebar ${mobile ? "is-open" : ""}`}>
        <a className="studio-brand" href="#overview" onClick={() => setMobile(false)}>
          <span>
            <img src="/favicon.ico" alt="" />
          </span>
          <div>
            ZCraft <strong>Studio workspace</strong>
          </div>
        </a>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {primary.map((key, i) => {
            const Icon = [LayoutDashboard, Package, MessageSquare][i];
            return (
              <a
                key={key}
                href={`#${key}`}
                aria-current={section === key ? "page" : undefined}
                onClick={() => setMobile(false)}
              >
                <Icon />
                <span>
                  {key === "overview" ? "Overview" : resources.find((r) => r.name === key)?.label}
                </span>
                {section === key && <span className="nav-active-dot" />}
              </a>
            );
          })}
          <div className="sidebar-caption">MANAGE</div>
          {Object.entries(groupIcons).map(([group, Icon]) => (
            <div className="nav-group" key={group}>
              <button
                className="nav-group-toggle"
                aria-expanded={openGroup === group}
                onClick={() => setOpenGroup((v) => (v === group ? "" : group))}
              >
                <Icon />
                <span>{group}</span>
                <ChevronRight className={openGroup === group ? "rotated" : ""} />
              </button>
              {openGroup === group && (
                <div className="nav-group-items">
                  {resources
                    .filter((r) => r.group === group && !primary.includes(r.name))
                    .map((r) => (
                      <a
                        key={r.name}
                        href={`#${r.name}`}
                        aria-current={section === r.name ? "page" : undefined}
                        onClick={() => setMobile(false)}
                      >
                        {r.label}
                      </a>
                    ))}
                  {group === "Workspace" && (
                    <a
                      href="#storage"
                      aria-current={section === "storage" ? "page" : undefined}
                      onClick={() => setMobile(false)}
                    >
                      Files & uploads
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        <a className="sidebar-site-link" href={SITE_URL} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open storefront
          <ArrowRight />
        </a>
        <div className="sidebar-account">
          <span className="account-avatar">{identity[0].toUpperCase()}</span>
          <div>
            <strong>Administrator</strong>
            <span title={identity}>{identity}</span>
          </div>
          <button title="Sign out" aria-label="Sign out" onClick={logout}>
            <ArrowRight />
          </button>
        </div>
      </aside>
      <div className="studio-main">
        <header className="studio-topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight />
            <strong>
              {resource?.label || (section === "storage" ? "Files & uploads" : "Overview")}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="admin-badge">
              <span />
              Admin access
            </span>
            <button
              className="icon-button"
              aria-label="New product"
              title="New product"
              onClick={() => setQuickCreate(resources[0])}
            >
              <Plus />
            </button>
          </div>
        </header>
        <main className="studio-page">
          {section === "overview" ? (
            <Overview navigate={navigate} create={setQuickCreate} />
          ) : section === "storage" ? (
            <Storage />
          ) : resource ? (
            <Collection key={section} resource={resource} />
          ) : null}
        </main>
      </div>
      {quickCreate && (
        <RecordEditor
          resource={quickCreate}
          row={null}
          initialMode="edit"
          onClose={() => setQuickCreate(null)}
          onSaved={() => {
            setQuickCreate(null);
            navigate(quickCreate.name);
            window.dispatchEvent(new Event("admin:refresh"));
          }}
        />
      )}
    </div>
  );
}
function Overview({
  navigate,
  create,
}: {
  navigate: (s: string) => void;
  create: (r: Resource) => void;
}) {
  const [stats, setStats] = useState<Array<number | null>>([null, null, null, null]),
    [products, setProducts] = useState<Row[]>([]),
    [requests, setRequests] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        await requireAdmin();
        const results = await Promise.all([
          db!
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("is_published", true),
          db!
            .from("custom_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "new"),
          db!
            .from("blog_posts")
            .select("id", { count: "exact", head: true })
            .eq("is_published", false),
          db!
            .from("newsletter_subscribers")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          db!
            .from("products")
            .select("id,title,slug,summary,price_cents,currency,is_published,updated_at")
            .order("updated_at", { ascending: false })
            .limit(5),
          db!
            .from("custom_requests")
            .select("id,name,work_type,status,created_at")
            .eq("status", "new")
            .order("created_at", { ascending: false })
            .limit(4),
        ]);
        if (!active) return;
        setStats(results.slice(0, 4).map((r) => (r.error ? null : (r.count ?? 0))));
        setProducts(results[4].data || []);
        setRequests(results[5].data || []);
        if (results.some((r) => r.error))
          setError("Some sections could not load. Check database access or retry.");
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="workspace-kicker">YOUR STUDIO, AT A GLANCE</span>
          <h1>
            Let’s make something great<span>.</span>
          </h1>
          <p>A little less admin. More time to build.</p>
        </div>
        <Button onClick={() => create(resources[0])}>
          <Plus />
          New product
        </Button>
      </div>
      {error && (
        <div className="workspace-error" role="alert">
          {error}
          <button onClick={() => setRefresh((v) => v + 1)}>Retry</button>
        </div>
      )}
      <div className="metric-grid">
        {[
          {
            label: "Published products",
            target: "products",
            icon: Package,
            note: "Live in your storefront",
          },
          {
            label: "New requests",
            target: "custom_requests",
            icon: MessageSquare,
            note: "Ready for your attention",
          },
          {
            label: "Draft posts",
            target: "blog_posts",
            icon: FileText,
            note: "Your next story starts here",
          },
          {
            label: "Subscribers",
            target: "newsletter_subscribers",
            icon: Mail,
            note: "Your active audience",
          },
        ].map((item, i) => (
          <button className="metric-card" key={item.label} onClick={() => navigate(item.target)}>
            <span className={`metric-icon tone-${i}`}>
              <item.icon />
            </span>
            <span className="metric-label">{item.label}</span>
            <strong>{loading ? "…" : (stats[i] ?? "—")}</strong>
            <small>
              {item.note}
              <ArrowRight />
            </small>
          </button>
        ))}
      </div>
      <div className="overview-columns">
        <section className="workspace-card">
          <div className="card-heading">
            <div>
              <h2>Recently updated</h2>
              <p>Pick up where you left off.</p>
            </div>
            <button className="text-link" onClick={() => navigate("products")}>
              All products <ArrowRight />
            </button>
          </div>
          {loading ? (
            <Skeleton />
          ) : products.length ? (
            <div className="recent-list">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    navigate("products");
                    sessionStorage.setItem("admin:open-product", p.id);
                  }}
                >
                  <span className="recent-icon">
                    <Package />
                  </span>
                  <span>
                    <strong>{p.title}</strong>
                    <small>{p.summary || p.slug}</small>
                  </span>
                  <Status value={p.is_published} field="is_published" />
                  <ChevronRight />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Your catalog starts here"
              description="Add your first product to get things moving."
              action={() => create(resources[0])}
              actionLabel="Create product"
            />
          )}
        </section>
        <section className="workspace-card">
          <div className="card-heading">
            <div>
              <h2>Needs your attention</h2>
              <p>The latest customer briefs.</p>
            </div>
            <span className="count-pill">{stats[1] ?? "—"}</span>
          </div>
          {loading ? (
            <Skeleton />
          ) : requests.length ? (
            <div className="request-list">
              {requests.map((r) => (
                <button key={r.id} onClick={() => navigate("custom_requests")}>
                  <span className="request-avatar">{r.name?.[0] || "?"}</span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.work_type}</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="You’re all caught up"
              description="New customer requests will appear here."
            />
          )}
          <button className="card-bottom-link" onClick={() => navigate("custom_requests")}>
            Open request inbox <ArrowRight />
          </button>
        </section>
      </div>
      <section className="quick-actions">
        <div>
          <h2>Make your next move</h2>
          <p>Small updates keep the studio moving.</p>
        </div>
        <button onClick={() => create(resources.find((r) => r.name === "blog_posts")!)}>
          <FileText />
          <span>
            <strong>Write a post</strong>
            <small>Share a story or tutorial</small>
          </span>
          <Plus />
        </button>
        <button onClick={() => navigate("site_settings")}>
          <Tag />
          <span>
            <strong>Update announcement</strong>
            <small>Something worth sharing</small>
          </span>
          <ArrowRight />
        </button>
        <button onClick={() => navigate("storage")}>
          <Upload />
          <span>
            <strong>Upload assets</strong>
            <small>Keep your files in order</small>
          </span>
          <ArrowRight />
        </button>
      </section>
    </>
  );
}
function Status({ value, field }: { value: any; field: string }) {
  const positive = value === true || ["completed", "approved", "active"].includes(value);
  const text =
    typeof value === "boolean"
      ? field === "is_published"
        ? value
          ? "Published"
          : "Draft"
        : field === "is_approved"
          ? value
            ? "Approved"
            : "Pending"
          : value
            ? "Active"
            : "Inactive"
      : label(String(value || "Unknown"));
  return (
    <span className={`status-badge ${positive ? "positive" : "neutral"}`}>
      <span />
      {text}
    </span>
  );
}
function Skeleton() {
  return (
    <div className="workspace-skeleton" role="status" aria-label="Loading records">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} />
      ))}
    </div>
  );
}
function Empty({
  title,
  description,
  action,
  actionLabel,
}: {
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="workspace-empty">
      <span>
        <Boxes />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button tone="paper" onClick={action}>
          <Plus />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
function Collection({ resource }: { resource: Resource }) {
  const [rows, setRows] = useState<Row[]>([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("newest"),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{ row: Row | null; mode: "view" | "edit" } | null>(null);
  const { toast } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("admin:refresh", refresh);
    return () => window.removeEventListener("admin:refresh", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        await requireAdmin();
        let query = db!
          .from(resource.name)
          .select(
            resource.name === "sale_entries"
              ? "*, products(title), sale_events(label)"
              : resource.name === "user_roles"
                ? "*"
                : "*",
            { count: "exact" },
          );
        if (debounced && resource.search.length)
          query = query.or(searchFilter(resource.search, debounced));
        if (filter !== "all" && resource.status)
          query = query.eq(
            resource.status,
            resource.status === "status" ? filter : filter === "true",
          );
        query = query.order(sort === "az" ? resource.title : resource.order, {
          ascending: sort === "az" ? true : sort === "oldest" ? true : resource.ascending || false,
        });
        const { data, error, count } = await query
          .range(page * pageSize, page * pageSize + pageSize - 1)
          .abortSignal(controller.signal);
        if (error) throw error;
        if (active) {
          setRows(data || []);
          setCount(count || 0);
          if (page > 0 && !data?.length) setPage((p) => p - 1);
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
  }, [resource, debounced, filter, sort, page, revision]);
  useEffect(() => {
    if (resource.name !== "products") return;
    const id = sessionStorage.getItem("admin:open-product");
    if (!id) return;
    sessionStorage.removeItem("admin:open-product");
    let active = true;
    void (async () => {
      try {
        await requireAdmin();
        const { data, error } = await db!.from("products").select("*").eq("id", id).single();
        if (error) throw error;
        if (active) setEditor({ row: data, mode: "edit" });
      } catch (e) {
        if (active)
          toast({ title: "Could not open product", description: errorMessage(e), tone: "error" });
      }
    })();
    return () => {
      active = false;
    };
  }, [resource, toast]);
  function title(row: Row) {
    if (resource.name === "site_settings") return "Website announcement";
    if (resource.name === "sale_entries") return row.products?.title || "Sale product";
    if (resource.name === "user_roles") return "Account access";
    return String(row[resource.title] || `Untitled ${resource.singular}`);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="workspace-kicker">{resource.group}</span>
          <h1>
            {resource.label}
            <span className="heading-count">{loading ? "…" : count}</span>
          </h1>
          <p>{resource.description}</p>
        </div>
        {resource.mode === "write" && (
          <Button onClick={() => setEditor({ row: null, mode: "edit" })}>
            <Plus />
            Add {resource.singular}
          </Button>
        )}
      </div>
      <section className="workspace-card collection-card">
        <div className="collection-toolbar">
          <div className="collection-search">
            <Search />
            <input
              ref={searchRef}
              disabled={!resource.search.length}
              aria-label={`Search ${resource.label.toLowerCase()}`}
              placeholder={
                resource.search.length
                  ? `Search all ${resource.label.toLowerCase()}…`
                  : "Browse records below"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch("");
                  searchRef.current?.focus();
                }}
              >
                <X />
              </button>
            )}
          </div>
          <div className="collection-controls">
            {resource.status && (
              <select
                aria-label="Filter status"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All statuses</option>
                {resource.status === "status" ? (
                  ["new", "in_progress", "completed", "closed"].map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="true">
                      {resource.status === "is_published"
                        ? "Published"
                        : resource.status === "is_approved"
                          ? "Approved"
                          : "Active"}
                    </option>
                    <option value="false">
                      {resource.status === "is_published"
                        ? "Draft"
                        : resource.status === "is_approved"
                          ? "Pending"
                          : "Inactive"}
                    </option>
                  </>
                )}
              </select>
            )}
            <select
              aria-label="Sort records"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="newest">
                {resource.ascending ? "Display order" : "Newest first"}
              </option>
              <option value="oldest">Oldest first</option>
              {!["id", "user_id"].includes(resource.title) && <option value="az">A → Z</option>}
            </select>
            <button
              className="icon-button"
              aria-label="Refresh records"
              disabled={loading}
              onClick={() => setRevision((v) => v + 1)}
            >
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
          </div>
        </div>
        {error ? (
          <div className="workspace-error" role="alert">
            {error}
            <button onClick={() => setRevision((v) => v + 1)}>Try again</button>
          </div>
        ) : loading ? (
          <Skeleton />
        ) : rows.length ? (
          <div className="collection-table-scroll">
            <table className="collection-table">
              <thead>
                <tr>
                  <th>{resource.name === "products" ? "Product" : label(resource.singular)}</th>
                  {resource.columns.map((c) => (
                    <th key={c}>{label(c)}</th>
                  ))}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id || i}>
                    <td>
                      <button
                        className="record-title-button"
                        onClick={() => setEditor({ row, mode: "view" })}
                      >
                        <span className="record-thumb">
                          {resource.name === "products" ? (
                            <Package />
                          ) : resource.group === "Content" ? (
                            <FileText />
                          ) : resource.group === "Inbox" ? (
                            <MessageSquare />
                          ) : (
                            <Boxes />
                          )}
                        </span>
                        <span>
                          <strong>{title(row)}</strong>
                          <small>
                            {resource.name === "sale_entries"
                              ? row.sale_events?.label
                              : row.slug || row.email || row.summary || ""}
                          </small>
                        </span>
                      </button>
                    </td>
                    {resource.columns.map((c) => (
                      <td key={c}>
                        {typeof row[c] === "boolean" || c === "status" ? (
                          <Status field={c} value={row[c]} />
                        ) : c === "product_id" && row.products ? (
                          row.products.title
                        ) : (
                          <span className={c.endsWith("_cents") ? "table-price" : ""}>
                            {displayValue(c, row[c], row)}
                          </span>
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        className="row-edit"
                        onClick={() =>
                          setEditor({ row, mode: resource.mode === "read" ? "view" : "edit" })
                        }
                      >
                        {resource.mode === "read" ? "View" : "Edit"}
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              search || filter !== "all"
                ? "No matching records"
                : `No ${resource.label.toLowerCase()} yet`
            }
            description={
              search || filter !== "all"
                ? "Try a different search or clear your filters."
                : `Your ${resource.label.toLowerCase()} will appear here.`
            }
            {...(resource.mode === "write"
              ? {
                  action: () => setEditor({ row: null, mode: "edit" }),
                  actionLabel: `Add ${resource.singular}`,
                }
              : {})}
          />
        )}
        <footer className="collection-pagination">
          <span>
            {count
              ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, count)} of ${count}`
              : "0 records"}
            {debounced ? " matching your search" : ""}
          </span>
          <div>
            <button disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(count / pageSize))}
            </span>
            <button
              disabled={(page + 1) * pageSize >= count || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
      {resource.mode === "read" && (
        <p className="collection-footnote">
          <ShieldCheck />
          Read-only history. This section does not change website content.
        </p>
      )}
      {editor && (
        <RecordEditor
          resource={resource}
          row={editor.row}
          initialMode={editor.mode}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setRevision((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
