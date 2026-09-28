import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X, XCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ToastContext, type ToastInput, type ToastTone } from "@/lib/toast-context";

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

/**
 * Minimal toast stack styled to the design system (hard borders, offset
 * shadows, mint/coral tones for success/error). Toasts auto-dismiss, can be
 * dismissed by hand, and announce via role="status" for screen readers.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev.slice(-3), { ...input, tone: input.tone ?? "success", id }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed right-4 top-20 z-[9998] flex w-[min(92vw,24rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-rise pointer-events-auto flex items-start gap-3 rounded-[12px] border-2 border-ink bg-paper-elevated p-3.5 shadow-pop-sm",
              t.tone === "error" && "bg-soft-coral",
              t.tone === "success" && "bg-soft-mint",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {t.tone === "error" ? (
                <XCircle className="size-5 text-destructive" />
              ) : t.tone === "info" ? (
                <AlertTriangle className="size-5 text-warning" />
              ) : (
                <CheckCircle2 className="size-5 text-success" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
              ) : null}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-full p-1 transition-colors hover:bg-ink/10"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
