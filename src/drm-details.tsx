import { useEffect, useRef } from "react";
import { Button } from "@/components/kit";
export function DrmDetails({ data, onClose }: { data: unknown; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const entries =
    data && typeof data === "object" && !Array.isArray(data) ? Object.entries(data) : null;
  return (
    <dialog
      ref={dialog}
      className="drm-details"
      aria-labelledby="drm-detail-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <div>
          <span className="workspace-kicker">License control</span>
          <h2 id="drm-detail-title">Record details</h2>
        </div>
        <Button tone="paper" onClick={onClose} autoFocus>
          Close
        </Button>
      </header>
      <div className="drm-details-body">
        {entries ? (
          <dl>
            {entries.map(([name, value]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>
                  {value == null ? (
                    "—"
                  ) : typeof value === "object" ? (
                    <pre>{JSON.stringify(value, null, 2)}</pre>
                  ) : typeof value === "boolean" ? (
                    value ? (
                      "Yes"
                    ) : (
                      "No"
                    )
                  ) : (
                    String(value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <pre>{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </dialog>
  );
}
