"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "warning";
export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Ctx = {
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2, 10);
      setToasts((prev) => [...prev, { id, ...t }]);
      setTimeout(() => dismiss(id), t.duration ?? 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const c = React.useContext(ToastContext);
  if (!c) throw new Error("useToast must be inside ToastProvider");
  return c;
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const variant = toast.variant ?? "default";
  const icons = {
    default: <Info className="size-5 text-primary" />,
    success: <CheckCircle2 className="size-5 text-success" />,
    error: <AlertCircle className="size-5 text-destructive" />,
    warning: <AlertCircle className="size-5 text-warning" />,
  };
  const borders = {
    default: "border-l-primary",
    success: "border-l-success",
    error: "border-l-destructive",
    warning: "border-l-warning",
  };
  return (
    <div
      className={cn(
        "pointer-events-auto w-full rounded-lg border border-neutral-200 bg-white shadow-lg border-l-4 p-4 animate-in slide-in-from-bottom-4 fade-in",
        borders[variant]
      )}
    >
      <div className="flex gap-3">
        <div className="shrink-0 pt-0.5">{icons[variant]}</div>
        <div className="flex-1 min-w-0">
          {toast.title && <div className="font-semibold text-sm text-neutral-900">{toast.title}</div>}
          {toast.description && (
            <div className="text-sm text-neutral-600 mt-1 leading-relaxed">{toast.description}</div>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-m-2 shrink-0 rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
