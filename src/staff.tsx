import { useEffect, useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import { db, requireAccess } from "./client";
import { resources } from "./workspace-config";
import type { AccessLevel } from "./access-model";
import { errorMessage } from "./feedback";
export const permissionPages = [
  { name: "overview", label: "Overview", group: "Workspace", readOnly: true },
  ...resources
    .filter((r) => r.name !== "user_roles")
    .map((r) => ({ name: r.name, label: r.label, group: r.group, readOnly: r.mode === "read" })),
  { name: "bbb_analytics", label: "BuiltByBit analytics", group: "Insights", readOnly: true },
  { name: "storage", label: "Files & uploads", group: "Workspace" },
  { name: "emails", label: "Email studio", group: "Community" },
  { name: "ziina", label: "Ziina payment links", group: "Commerce" },
  ...["products", "customers", "licenses", "validations", "requests", "audit", "sync"].map(
    (name) => ({
      name: `drm_${name}`,
      label: `DRM ${name}`,
      group: "Licensing",
      readOnly: ["validations", "requests", "audit"].includes(name),
    }),
  ),
];
type Member = { user_id: string; display_name: string; enabled: boolean };
export function Staff() {
  const [members, setMembers] = useState<Member[]>([]),
    [selected, setSelected] = useState<Member | null>(null);
  const [grants, setGrants] = useState<Record<string, AccessLevel>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [baseline, setBaseline] = useState("");
  const draft = JSON.stringify({ selected, grants });
  const dirty = !!selected && draft !== baseline;
  function discardAllowed() {
    return !dirty || window.confirm("Discard unsaved permission changes?");
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function preset(kind: string) {
    const next: Record<string, AccessLevel> = {};
    for (const page of permissionPages) {
      const included =
        kind === "viewer" ||
        (kind === "support" &&
          [
            "custom_requests",
            "orders",
            "drm_licenses",
            "drm_customers",
            "drm_requests",
            "drm_validations",
          ].includes(page.name)) ||
        (kind === "content" && ["Content", "Catalog"].includes(page.group));
      next[page.name] = included ? (kind === "viewer" || page.readOnly ? "read" : "edit") : "none";
    }
    setGrants(next);
  }
  const [audit, setAudit] = useState<Record<string, any>[]>([]);
  async function load() {
    setBusy(true);
    setError("");
    try {
      await requireAccess("staff");
      const [m, a] = await Promise.all([
        db!.from("workspace_members").select("*").order("display_name"),
        db!
          .from("workspace_permission_audit")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      if (m.error) throw m.error;
      if (a.error) throw a.error;
      setMembers(m.data || []);
      setAudit(a.data || []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function select(member: Member) {
    if (!discardAllowed()) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await db!
        .from("workspace_page_permissions")
        .select("page,access")
        .eq("user_id", member.user_id);
      if (error) throw error;
      setSelected(member);
      const next = Object.fromEntries((data || []).map((p) => [p.page, p.access]));
      setGrants(next);
      setBaseline(JSON.stringify({ selected: member, grants: next }));
      setNotice("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await requireAccess("staff", "manage");
      const result = await db!.rpc("workspace_save_member", {
        target_id: selected.user_id.trim(),
        member_name: selected.display_name.trim(),
        member_enabled: selected.enabled,
        page_grants: grants,
      });
      if (result.error) throw result.error;
      setBaseline(draft);
      setNotice(
        "Permissions saved. Database and API enforcement takes effect immediately; the user’s navigation updates within a minute.",
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="staff-page">
      <div className="page-heading">
        <div>
          <span className="workspace-kicker">WORKSPACE / PEOPLE</span>
          <h1>Staff & permissions</h1>
          <p>Assign access to existing Supabase accounts. Staff do not need the admin role.</p>
        </div>
        <Button
          disabled={busy}
          onClick={() => {
            if (!discardAllowed()) return;
            const member = { user_id: "", display_name: "", enabled: true };
            setSelected(member);
            setBaseline(JSON.stringify({ selected: member, grants: {} }));
            setGrants({});
            setNotice("");
          }}
        >
          Add staff member
        </Button>
      </div>
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="staff-layout">
        <aside className="workspace-card staff-list">
          <h2>Staff accounts</h2>
          <input
            className={inputClass}
            aria-label="Search staff accounts"
            placeholder="Find a staff member…"
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
          />
          {members
            .filter((m) =>
              `${m.display_name} ${m.user_id}`.toLowerCase().includes(accountSearch.toLowerCase()),
            )
            .map((m) => (
              <button
                key={m.user_id}
                disabled={busy}
                aria-pressed={selected?.user_id === m.user_id}
                onClick={() => void select(m)}
              >
                <strong>{m.display_name || m.user_id}</strong>
                <small>{m.enabled ? "Active" : "Disabled"}</small>
              </button>
            ))}
          {!members.length && <p>{busy ? "Loading accounts…" : "Add your first staff member."}</p>}
        </aside>
        {selected ? (
          <form className="workspace-card staff-editor" onSubmit={save}>
            <h2>Page access</h2>
            <Field
              label="Supabase Auth user UUID"
              hint="Create or invite the account in Supabase Auth, then copy its user UUID here."
            >
              <input
                className={inputClass}
                required
                disabled={busy || members.some((m) => m.user_id === selected.user_id)}
                value={selected.user_id}
                onChange={(e) => setSelected({ ...selected, user_id: e.target.value })}
              />
            </Field>
            <Field label="Staff name">
              <input
                className={inputClass}
                required
                maxLength={200}
                value={selected.display_name}
                onChange={(e) => setSelected({ ...selected, display_name: e.target.value })}
              />
            </Field>
            <label className="staff-enabled">
              <input
                type="checkbox"
                checked={selected.enabled}
                onChange={(e) => setSelected({ ...selected, enabled: e.target.checked })}
              />{" "}
              Workspace access enabled
            </label>
            <p>
              Read: view records. Edit: create and update. Manage: also delete and perform sensitive
              actions. Administrator roles retain full access.
            </p>
            <div className="staff-presets">
              <strong>Start with a preset</strong>
              <p>Presets replace page access. Review the groups below before saving.</p>
              {[
                ["support", "Support"],
                ["content", "Content editor"],
                ["viewer", "Read all"],
                ["none", "Clear access"],
              ].map(([key, text]) => (
                <button type="button" disabled={busy} key={key} onClick={() => preset(key)}>
                  {text}
                </button>
              ))}
            </div>
            {Array.from(new Set(permissionPages.map((p) => p.group))).map((group) => (
              <details className="staff-permission-group" key={group}>
                <summary>
                  {group}
                  <span>
                    {
                      permissionPages.filter(
                        (p) => p.group === group && grants[p.name] && grants[p.name] !== "none",
                      ).length
                    }{" "}
                    pages allowed
                  </span>
                </summary>
                <fieldset>
                  <legend className="sr-only">{group}</legend>
                  {permissionPages
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <Field key={p.name} label={p.label}>
                        <select
                          className={inputClass}
                          disabled={busy}
                          value={grants[p.name] || "none"}
                          onChange={(e) =>
                            setGrants({ ...grants, [p.name]: e.target.value as AccessLevel })
                          }
                        >
                          {(p.readOnly ? ["none", "read"] : ["none", "read", "edit", "manage"]).map(
                            (level) => (
                              <option key={level} value={level}>
                                {level === "none"
                                  ? "No access"
                                  : level[0].toUpperCase() + level.slice(1)}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                    ))}
                </fieldset>
              </details>
            ))}
            <div className="staff-save-bar">
              <div>
                <strong>
                  {selected.enabled
                    ? Object.values(grants).filter((v) => v !== "none").length + " pages allowed"
                    : "Workspace access disabled"}
                </strong>
                <small>{dirty ? "Unsaved changes" : "All changes saved"}</small>
              </div>
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={() => {
                  const saved = JSON.parse(baseline);
                  setSelected(saved.selected);
                  setGrants(saved.grants);
                }}
              >
                Reset changes
              </button>
              <Button disabled={busy || !dirty}>{busy ? "Saving…" : "Save permissions"}</Button>
            </div>
          </form>
        ) : (
          <section className="workspace-card staff-editor">
            <h2>Choose a staff member</h2>
            <p>
              Manage their page visibility and actions here. Access management itself is restricted
              to administrators.
            </p>
          </section>
        )}
      </div>
      <section className="workspace-card staff-editor">
        <h2>Recent access changes</h2>
        {audit.length ? (
          <div className="collection-table-scroll">
            <table className="collection-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Staff member</th>
                  <th>Changed by</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                    <td>{a.action}</td>
                    <td title={a.subject_id}>
                      {members.find((m) => m.user_id === a.subject_id)?.display_name ||
                        a.subject_id}
                    </td>
                    <td>{a.actor_id || "Database"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No permission changes yet.</p>
        )}
      </section>
    </section>
  );
}
