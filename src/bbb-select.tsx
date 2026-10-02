import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "@/lib/icons";
type Option = { value: string; label: string; detail?: string; group?: string };
export function BbbSelect({
  label,
  options,
  value,
  onChange,
  multiple = false,
  placeholder = "Select",
  disabled = false,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = multiple ? value.split(",").filter(Boolean) : [value];
  const current = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    `${o.label} ${o.detail || ""} ${o.group || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="bbb-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <span className="bbb-field-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        className="bbb-select-trigger"
        ref={trigger}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setSearch("");
        }}
      >
        <span id={`${id}-value`}>
          {multiple
            ? selected.length
              ? `${selected.length} product${selected.length > 1 ? "s" : ""} selected`
              : placeholder
            : current?.label || placeholder}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          className="bbb-select-menu"
          id={`${id}-menu`}
          role="dialog"
          aria-labelledby={`${id}-label`}
        >
          {(multiple || options.length > 8) && (
            <div className="bbb-select-search">
              <Search size={14} />
              <input
                autoFocus
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder={multiple ? "Search by name or ID…" : `Search ${label.toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    root.current?.querySelector<HTMLButtonElement>(".bbb-select-option")?.focus();
                  }
                }}
              />
            </div>
          )}
          <div className="bbb-select-options">
            {multiple && (
              <button
                type="button"
                className="bbb-select-option"
                aria-pressed={!selected.length}
                onClick={() => onChange("")}
              >
                <span>
                  <strong>All products</strong>
                  <small>Your entire catalog</small>
                </span>
                {!selected.length && <Check size={15} />}
              </button>
            )}
            {filtered.map((o, i) => (
              <div key={o.value}>
                {o.group && o.group !== filtered[i - 1]?.group && (
                  <div className="bbb-select-group">{o.group}</div>
                )}
                <button
                  type="button"
                  className="bbb-select-option"
                  aria-pressed={selected.includes(o.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const buttons = Array.from(
                        root.current?.querySelectorAll<HTMLButtonElement>(".bbb-select-option") ||
                          [],
                      );
                      buttons[
                        Math.max(
                          0,
                          Math.min(
                            buttons.length - 1,
                            buttons.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1),
                          ),
                        )
                      ]?.focus();
                    }
                  }}
                  onClick={() => {
                    if (multiple)
                      onChange(
                        selected.includes(o.value)
                          ? selected.filter((v) => v !== o.value).join(",")
                          : [...selected, o.value].join(","),
                      );
                    else {
                      onChange(o.value);
                      setOpen(false);
                      trigger.current?.focus();
                    }
                  }}
                >
                  <span>
                    <strong>{o.label}</strong>
                    {o.detail && <small>{o.detail}</small>}
                  </span>
                  {selected.includes(o.value) && <Check size={15} />}
                </button>
              </div>
            ))}
            {!filtered.length && (
              <p className="bbb-select-empty">No matching products or options.</p>
            )}
          </div>
          {multiple && (
            <button
              type="button"
              className="bbb-select-done"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}
