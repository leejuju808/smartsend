"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogsDrawer } from "./LogsDrawer";

export function RowActions({
  row, onRefetch,
}: {
  row: { id: string; status: string; attempt_count: number; max_attempts: number; last_error?: string; lead_id?: string; };
  onRefetch: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-row-actions]')) setMenu(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  async function retry() {
    const res = await fetch("/api/queue/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIds: [row.id] }) });
    const json = await res.json();
    if (!res.ok || json.ok === false) return toast.error(json.message ?? "Retry failed");
    toast.success("Re-enqueued 1 item");
    onRefetch();
  }

  async function cancel() {
    const res = await fetch("/api/queue/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queueIds: [row.id] }) });
    const json = await res.json();
    if (!res.ok || json.ok === false) return toast.error(json.message ?? "Cancel failed");
    toast.success("Canceled");
    onRefetch();
  }

  function copyError() {
    const text = (row as any).last_error || "No error.";
    navigator.clipboard.writeText(text);
    toast.success("Copied last error");
  }

  const canRetry = row.status === "failed" && row.attempt_count < row.max_attempts;
  const canCancel = row.status === "queued" || row.status === "sending";

  return (
    <>
      <div className="relative" data-row-actions ref={menuRef}>
        <Button variant="ghost" size="sm" onClick={() => setMenu(v => !v)}>⋯</Button>
        {menu && (
          <div className="absolute right-0 mt-1 w-40 rounded-md border bg-popover text-popover-foreground shadow z-50">
            <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => { setOpen(true); setMenu(false); }}>View Logs</button>
            <button className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => { copyError(); setMenu(false); }}>Copy Last Error</button>
            <div className="my-1 h-px bg-border" />
            <button className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-50" disabled={!canRetry} onClick={() => { retry(); setMenu(false); }}>Retry</button>
            <button className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-50" disabled={!canCancel} onClick={() => { cancel(); setMenu(false); }}>Cancel</button>
          </div>
        )}
      </div>
      <LogsDrawer
        open={open}
        onOpenChange={setOpen}
        title="Activity Log"
        queueId={row.id}
        leadId={row.lead_id}
      />
    </>
  );
}


