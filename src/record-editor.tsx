import { useEffect, useRef, useState } from "react";
import { Button, Field, inputClass } from "@/components/kit";
import { Markdown } from "@/components/markdown";
import { X, Save, Eye, Plus, Trash2, ExternalLink, Loader2 } from "@/lib/icons";
import { useToast } from "@/lib/toast-context";
import { SITE_URL } from "@/lib/site";
import { db, requireAdmin } from "./client";
import { errorMessage } from "./feedback";
import {
  arrays,
  displayValue,
  fieldGroup,
  hints,
  label,
  longFields,
  newRecord,
  options,
  readonlyFields,
  relations,
  type Resource,
  type Row,
  type Field as FieldType,
} from "./workspace-config";
import { fieldValue, inputValue, slugify } from "./record-values";
import { ImagePreview } from "./image-preview";
import { imageSource, isImageField } from "./image-source";

function RelationField({
  field,
  value,
  onChange,
}: {
  field: FieldType;
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [choices, setChoices] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [error, setError] = useState("");
  const relation = relations[field.name];
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await requireAdmin();
          let query = db!
            .from(relation.table)
            .select(`id,${relation.title}`)
            .order(relation.title)
            .limit(30);
          if (search) query = query.ilike(relation.title, `%${search.replace(/[%_]/g, "")}%`);
          const { data, error } = await query;
          if (error) throw error;
          if (active) {
            setChoices(data || []);
            setError("");
          }
        } catch (e) {
          if (active) setError(errorMessage(e));
        }
      })();
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, relation]);
  useEffect(() => {
    let active = true;
    if (value)
      void (async () => {
        const { data } = await db!
          .from(relation.table)
          .select(`id,${relation.title}`)
          .eq("id", value)
          .maybeSingle();
        if (active) setSelected(data);
      })();
    return () => {
      active = false;
    };
  }, [value, relation]);
  return (
    <div className="relation-control">
      <input
        className={inputClass}
        aria-label={`Find ${label(field.name)}`}
        placeholder={`Find ${label(field.name).toLowerCase()}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        className={inputClass}
        aria-label={label(field.name)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose {label(field.name).toLowerCase()}</option>
        {value && !choices.some((c) => c.id === value) && (
          <option value={value}>{selected?.[relation.title] || "Current selection"}</option>
        )}
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c[relation.title] || c.id}
          </option>
        ))}
      </select>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
function RelationName({ name, value }: { name: string; value: string }) {
  const relation = relations[name];
  const [text, setText] = useState(value || "—");
  useEffect(() => {
    let active = true;
    if (value)
      void db!
        .from(relation.table)
        .select(relation.title)
        .eq("id", value)
        .maybeSingle()
        .then(({ data }) => {
          if (active && data) setText((data as unknown as Row)[relation.title] || value);
        });
    return () => {
      active = false;
    };
  }, [relation, value]);
  return <>{text}</>;
}

export function RecordEditor({
  resource,
  row,
  initialMode,
  onClose,
  onSaved,
}: {
  resource: Resource;
  row: Row | null;
  initialMode: "view" | "edit";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const isNew = row === null;
  const initial = useRef(row || newRecord(resource));
  const fields = resource.fields.filter((f) => !readonlyFields.includes(f.name));
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, inputValue(f, initial.current[f.name])])),
  );
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState(initialMode);
  const [tab, setTab] = useState("Basics"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = touched.size > 0;
  const title = String(
    values[resource.title] || row?.[resource.title] || `New ${resource.singular}`,
  );
  const groups = ["Basics", "Content", "Pricing & links", "Media", "Visibility", "Details"].filter(
    (g) => fields.some((f) => fieldGroup(f.name) === g),
  );
  const activeTab = groups.includes(tab) ? tab : groups[0];
  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    onClose();
  };
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(name: string, value: string | boolean) {
    setValues((v) => ({
      ...v,
      [name]: value,
      ...(isNew &&
      ["title", "name"].includes(name) &&
      !touched.has("slug") &&
      fields.some((f) => f.name === "slug")
        ? { slug: slugify(String(value)) }
        : {}),
    }));
    setTouched((t) => {
      const next = new Set(t);
      next.add(name);
      return next;
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (resource.mode === "read") return;
    setBusy(true);
    setError("");
    try {
      const user = await requireAdmin();
      const payload: Row = {};
      for (const f of fields) {
        if (!isNew && !touched.has(f.name)) continue;
        const value = fieldValue(f, values[f.name], isNew);
        if (value !== undefined) payload[f.name] = value;
      }
      if (isNew && resource.fields.some((f) => f.name === "slug") && values.slug)
        payload.slug = values.slug;
      for (const key of [
        "cover_image_url",
        "avatar_url",
        ...(resource.name === "blog_media" ? ["url"] : []),
      ]) {
        if (payload[key] && !imageSource(String(payload[key]), SITE_URL))
          throw new Error(`${label(key)} needs a valid HTTP or HTTPS image link.`);
      }
      if (
        resource.name === "user_roles" &&
        row?.user_id === user.id &&
        row?.role === "admin" &&
        ((payload.role && payload.role !== "admin") ||
          (payload.user_id && payload.user_id !== user.id))
      )
        throw new Error("Ask another administrator to change your own admin access.");
      if (!isNew && Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      const query = isNew
        ? db!.from(resource.name).insert(payload)
        : db!.from(resource.name).update(payload).eq("id", row!.id);
      const result = await query.select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error("Nothing was saved. Your access may have changed.");
      toast({
        title: isNew ? `${label(resource.singular)} created` : "Changes saved",
        description: String(values[resource.title] || "Your changes are ready."),
      });
      onSaved();
    } catch (e) {
      const text = errorMessage(e);
      setError(text);
      toast({ title: "Could not save", description: text, tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!row || !resource.fields.some((f) => f.name === "archived_at")) return;
    const archived = !!row.archived_at;
    setBusy(true);
    setError("");
    try {
      await requireAdmin();
      const payload = { archived_at: archived ? null : new Date().toISOString() };
      const { data, error } = await db!.from(resource.name).update(payload).eq("id", row.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nothing was updated.");
      toast({ title: archived ? `${label(resource.singular)} restored` : `${label(resource.singular)} archived` });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !row ||
      !window.confirm(`Delete “${title}” permanently? Related records may also be removed.`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const user = await requireAdmin();
      if (resource.name === "user_roles" && row.user_id === user.id && row.role === "admin")
        throw new Error("You cannot remove your own administrator access here.");
      const { data, error } = await db!.from(resource.name).delete().eq("id", row.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nothing was deleted.");
      toast({ title: `${label(resource.singular)} deleted` });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="record-dialog studio-workspace"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-labelledby="record-title"
    >
      <header className="record-dialog-header">
        <div>
          <span className="workspace-kicker">
            {resource.label} / {isNew ? "Create" : mode === "view" ? "Details" : "Edit"}
          </span>
          <h2 id="record-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close editor"
          onClick={close}
          disabled={busy}
        >
          <X />
        </button>
      </header>
      <div className="editor-mode-bar">
        <div className="segmented">
          <button type="button" aria-pressed={mode === "view"} onClick={() => setMode("view")}>
            <Eye /> Preview
          </button>
          {resource.mode !== "read" && (
            <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
              <Save /> Edit details
            </button>
          )}
        </div>
        {dirty && <span className="unsaved-indicator">Unsaved changes</span>}
        {resource.path && row?.slug && (
          <a
            className="text-link"
            href={`${SITE_URL}${resource.path.endsWith("/") ? resource.path + encodeURIComponent(row.slug) : resource.path}`}
            target="_blank"
            rel="noreferrer"
          >
            View on site <ExternalLink />
          </a>
        )}
      </div>
      <form onSubmit={save} className="record-form" noValidate>
        <div className="record-scroll">
          {error && (
            <p role="alert" className="workspace-error">
              {error}
            </p>
          )}
          {mode === "view" ? (
            <div className="record-preview">
              <ImagePreview
                value={String(
                  values.cover_image_url ||
                    values.cover_image_path ||
                    values.avatar_url ||
                    (resource.name === "blog_media" ? values.url : "") ||
                    "",
                )}
                alt={String(values.cover_image_alt || values.alt || title)}
                storage={!values.cover_image_url && !!values.cover_image_path}
              />
              <div className="preview-heading">
                <span className="workspace-kicker">{resource.singular}</span>
                <h3>{title}</h3>
                {(values.summary || values.excerpt) && (
                  <p>{String(values.summary || values.excerpt)}</p>
                )}
              </div>
              {fields
                .filter((f) => longFields.includes(f.name) && values[f.name])
                .map((f) => (
                  <section key={f.name}>
                    <h4>{label(f.name)}</h4>
                    <Markdown source={String(values[f.name])} />
                  </section>
                ))}
              <dl>
                {fields
                  .filter((f) => !longFields.includes(f.name) && f.name !== resource.title)
                  .map((f) => (
                    <div key={f.name}>
                      <dt>{label(f.name)}</dt>
                      <dd>
                        {relations[f.name] ? (
                          <RelationName name={f.name} value={String(values[f.name] || "")} />
                        ) : arrays.includes(f.name) ? (
                          String(values[f.name]).split("\n").join(" · ")
                        ) : f.name.endsWith("_cents") ? (
                          `${values[f.name] || "0"} ${values.currency || row?.currency || "USD"}`
                        ) : typeof values[f.name] === "boolean" ? (
                          values[f.name] ? (
                            "Yes"
                          ) : (
                            "No"
                          )
                        ) : (
                          String(values[f.name] || "—")
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
              {row?.created_at && (
                <p className="record-meta">
                  Created {displayValue("created_at", row.created_at)} · ID {row.id}
                </p>
              )}
            </div>
          ) : (
            <>
              <nav className="editor-tabs" aria-label="Editor sections">
                {groups.map((g) => (
                  <button
                    type="button"
                    key={g}
                    aria-current={g === activeTab ? "page" : undefined}
                    onClick={() => setTab(g)}
                  >
                    {g}
                  </button>
                ))}
              </nav>
              <div className="editor-fields">
                {fields
                  .filter((f) => fieldGroup(f.name) === activeTab)
                  .map((f) => {
                    const value = values[f.name];
                    const choices = options[f.name];
                    const wide =
                      longFields.includes(f.name) ||
                      arrays.includes(f.name) ||
                      f.type === "json" ||
                      !!relations[f.name];
                    return (
                      <div className={wide ? "field-wide" : ""} key={f.name}>
                        {f.type === "boolean" ? (
                          <label className="toggle-field">
                            <span>
                              <strong>{label(f.name)}</strong>
                              <small>
                                {f.name === "is_published"
                                  ? "Visible on the public website"
                                  : f.name === "is_featured"
                                    ? "Highlight this item on the site"
                                    : "Enable or disable this option"}
                              </small>
                            </span>
                            <input
                              type="checkbox"
                              checked={value === true}
                              onChange={(e) => change(f.name, e.target.checked)}
                            />
                          </label>
                        ) : (
                          <Field
                            label={`${label(f.name)}${f.required ? " *" : ""}`}
                            hint={arrays.includes(f.name) ? "One item per line." : hints[f.name]}
                          >
                            {relations[f.name] ? (
                              <RelationField
                                field={f}
                                value={String(value)}
                                onChange={(v) => change(f.name, v)}
                              />
                            ) : choices ? (
                              <select
                                className={inputClass}
                                value={String(value)}
                                onChange={(e) => change(f.name, e.target.value)}
                              >
                                <option value="">Choose…</option>
                                {value && !choices.includes(String(value)) && (
                                  <option>{String(value)}</option>
                                )}
                                {choices.map((c) => (
                                  <option key={c} value={c}>
                                    {label(c)}
                                  </option>
                                ))}
                              </select>
                            ) : wide ? (
                              <textarea
                                className={inputClass}
                                value={String(value)}
                                rows={longFields.includes(f.name) ? 10 : 4}
                                placeholder={
                                  arrays.includes(f.name)
                                    ? "Add one item per line…"
                                    : f.type === "json"
                                      ? '{"website": "https://…"}'
                                      : "Write here…"
                                }
                                onChange={(e) => change(f.name, e.target.value)}
                              />
                            ) : (
                              <input
                                className={inputClass}
                                value={String(value)}
                                type={
                                  f.type === "number"
                                    ? "number"
                                    : f.name.endsWith("_at")
                                      ? "datetime-local"
                                      : f.name.endsWith("_on")
                                        ? "date"
                                        : f.name === "email"
                                          ? "email"
                                          : "text"
                                }
                                step={
                                  f.name.endsWith("_cents") || f.name === "rating" ? "0.01" : "1"
                                }
                                onChange={(e) => change(f.name, e.target.value)}
                              />
                            )}
                          </Field>
                        )}
                        {isImageField(f.name) && (
                          <ImagePreview
                            compact
                            value={String(value)}
                            alt={String(values.cover_image_alt || values.alt || "")}
                            storage={f.name === "cover_image_path"}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
        <footer className="record-actions">
          {!isNew && resource.mode === "write" ? (
            <span className="record-danger-actions">
              {resource.fields.some((f) => f.name === "archived_at") && (
                <button
                  type="button"
                  className="danger-link"
                  disabled={busy}
                  onClick={() => void archive()}
                >
                  <Save />
                  {row?.archived_at ? "Restore" : "Archive"}
                </button>
              )}
              <button
                type="button"
                className="danger-link"
                disabled={busy}
                onClick={() => void remove()}
              >
                <Trash2 />
                Delete
              </button>
            </span>
          ) : (
            <span />
          )}
          <div>
            <Button type="button" tone="paper" disabled={busy} onClick={close}>
              {mode === "view" && !dirty ? "Close" : "Cancel"}
            </Button>
            {resource.mode !== "read" && (
              <Button type="submit" disabled={busy || (!isNew && !dirty)}>
                {busy ? <Loader2 className="spin" /> : isNew ? <Plus /> : <Save />}
                {busy ? "Saving…" : isNew ? `Create ${resource.singular}` : "Save changes"}
              </Button>
            )}
          </div>
        </footer>
      </form>
    </dialog>
  );
}
