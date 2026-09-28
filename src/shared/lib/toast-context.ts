import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastInput = { title: string; description?: string; tone?: ToastTone };

export type ToastContextValue = { toast: (input: ToastInput) => void };

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast helper. Must be rendered under <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
