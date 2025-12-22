"use client";
import { useEffect } from "react";

export default function Toast({
  children,
  onClose,
  duration = 4500,
}: {
  children: React.ReactNode;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 rounded-xl border bg-white px-4 py-3 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <span className="text-sm">✅ {children}</span>
        <button
          onClick={onClose}
          className="ml-2 rounded-md border px-2 text-xs hover:bg-neutral-50"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
} 