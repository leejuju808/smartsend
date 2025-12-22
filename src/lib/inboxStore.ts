"use client";

import { useCallback, useMemo, useState } from "react";

export type EmailRow = {
  id: string;
  user_id: string;
  from_email: string;
  subject: string | null;
  preview: string | null;
  status: "open" | "replied" | "snoozed" | "closed";
  has_replied?: boolean;
  thread_id?: string | null;
  created_at: string;
  updated_at: string;
};

export function useInboxStore(initial: EmailRow[] = []) {
  const [rows, setRows] = useState<EmailRow[]>(initial);

  const merge = useCallback((incoming: EmailRow) => {
    setRows((curr) => {
      const idx = curr.findIndex((r) => r.id === incoming.id);
      if (idx === -1) return [incoming, ...curr].sort((a,b) => +new Date(b.updated_at) - +new Date(a.updated_at));
      const next = [...curr];
      next[idx] = { ...next[idx], ...incoming };
      return next.sort((a,b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    });
  }, []);

  const remove = useCallback((id: string) => {
    setRows((curr) => curr.filter((r) => r.id !== id));
  }, []);

  const counts = useMemo(() => ({
    open: rows.filter(r => r.status === "open").length,
    replied: rows.filter(r => r.status === "replied").length,
    snoozed: rows.filter(r => r.status === "snoozed").length,
    closed: rows.filter(r => r.status === "closed").length,
    all: rows.length,
  }), [rows]);

  return { rows, setRows, merge, remove, counts };
}
