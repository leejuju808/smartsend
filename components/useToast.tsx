"use client";
import { createContext, useContext, useState, useCallback } from "react";

type Toast = { id: number; msg: string };
const ToastCtx = createContext<{ notify: (msg: string) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((msg: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-6 right-6 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="bg-yellow-500 text-black px-4 py-2 rounded-lg shadow-lg">{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
};