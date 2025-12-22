"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "info";
export type Toast = {
  id: string;
  title?: string;
  description?: string;
  type?: ToastType;
  duration?: number; // ms
};

type Ctx = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = {
      id,
      type: t.type ?? "info",
      duration: t.duration ?? 4000,
      ...t,
    };
    setToasts((prev) => [toast, ...prev]);
    if (toast.duration! > 0) {
      setTimeout(() => dismiss(id), toast.duration);
    }
  }, [dismiss]);

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <Toaster />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

function Toaster() {
  const { toasts, dismiss } = useToast();

  const typeStyle = (type?: ToastType) => {
    switch (type) {
      case "success": return "bg-emerald-500 text-black";
      case "error":   return "bg-red-500 text-white";
      default:        return "bg-gray-800 text-white";
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[320px] max-w-[90vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-2xl shadow-lg p-3 border border-black/20 ${typeStyle(t.type)}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {t.title && <div className="text-sm font-semibold leading-tight">{t.title}</div>}
              {t.description && <div className="text-sm opacity-90 mt-0.5">{t.description}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="rounded-md px-2 py-1 text-xs bg-black/10 hover:bg-black/20"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}