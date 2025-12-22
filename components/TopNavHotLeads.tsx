// components/TopNavHotLeads.tsx
"use client";

import { useEffect, useState } from "react";
import { useLeadDrawer } from "@/contexts/LeadDrawerContext";

type HotItem = {
  id: string;
  lead_id: string;
  created_at: string;
  was_seen: boolean;
  lead: { id: string; name: string | null; email: string; city: string | null };
  snippet: string | null;
};

export function TopNavHotLeads() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HotItem[]>([]);
  const [countUnseen, setCountUnseen] = useState(0);
  const [loading, setLoading] = useState(true);
  const { openLead } = useLeadDrawer();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/hotleads/today", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setCountUnseen(data.count_unseen || 0);
      }
    } catch (err) {
      console.error("Failed to load hot leads:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Refresh every 30 seconds
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Handle escape key to close panel
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (countUnseen > 0) {
      try {
        await fetch("/api/hotleads/mark-seen", { method: "POST" });
        setCountUnseen(0);
        // Update items to mark them as seen
        setItems((prev) =>
          prev.map((item) => ({ ...item, was_seen: true }))
        );
      } catch (err) {
        console.error("Failed to mark hot leads as seen:", err);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="relative inline-flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-[0.75rem] text-neutral-100 hover:border-emerald-500/70"
      >
        <span>Hot Leads</span>
        {countUnseen > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 text-[0.65rem] font-semibold text-neutral-950">
            {countUnseen}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className="flex h-full w-full max-w-sm flex-col border-l border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
                  Today&apos;s Hot Leads
                </div>
                <div className="text-sm text-neutral-100">
                  Homeowners ready to talk now
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[0.75rem] text-neutral-400 hover:text-neutral-100"
              >
                Close
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {loading ? (
                <div className="mt-4 text-neutral-400">Loading…</div>
              ) : items.length === 0 ? (
                <div className="mt-4 text-neutral-400">
                  No hot leads yet today. When SmartSend detects a homeowner
                  excited or ready to book, they&apos;ll show up here.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => {
                    const lead = item.lead;
                    const name = lead.name || lead.email;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          openLead(lead.id);
                          setOpen(false);
                        }}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-left hover:border-emerald-500/70"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-neutral-50 truncate">
                            {name}
                          </div>
                          <div className="text-[0.6rem] text-neutral-500">
                            {new Date(item.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                        {lead.city && (
                          <div className="text-[0.65rem] text-neutral-400">
                            {lead.city}
                          </div>
                        )}
                        {item.snippet && (
                          <div className="mt-1 text-[0.7rem] text-neutral-300 line-clamp-2">
                            &ldquo;{item.snippet}&rdquo;
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

