"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { RoleBadge } from "@/components/role-badge";

type Row = {
  thread_id: string;
  lead_id: string;
  lead_email: string;
  first_name: string | null;
  last_name: string | null;
  last_msg_at: string | null;
  last_inbound_label: string | null;
  replied: boolean;
  last_preview: string | null;
  ooo_status: string | null;
  ooo_due: string | null;
};

const LABELS: { key: string; text: string }[] = [
  { key: "unreplied", text: "Unreplied" },
  { key: "reply", text: "Reply (AI)" },
  { key: "ooa", text: "OOO" },
  { key: "bounce", text: "Bounce" },
  { key: "spam", text: "Spam" },
  { key: "forward", text: "Fwd" },
  { key: "not-reply", text: "Not reply" },
];

type InboxClientProps = {
  campaignId: string;
  campaignName: string;
  role: "owner" | "editor" | "viewer";
};

export default function InboxClient({ campaignId, campaignName, role }: InboxClientProps) {
  const sb = useMemo(supabaseBrowser, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<string[]>(["unreplied"]);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [end, setEnd] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const LIMIT = 25;

  const load = useCallback(
    async (reset = false) => {
      if (loading || (end && !reset)) return;

      const before = reset ? null : cursor;
      setLoading(true);
      setErrorMessage(null);

      try {
        const { data, error } = await sb.rpc("list_inbox", {
          p_campaign: campaignId,
          p_filters: filters.length ? filters : null,
          p_search: search || null,
          p_limit: LIMIT,
          p_before: before,
        });

        if (error) {
          console.error("list_inbox error", error);
          setErrorMessage(error.message ?? "Failed to load inbox");
          if (reset) {
            setRows([]);
            setCursor(null);
            setEnd(false);
          }
          return;
        }

        const newRows = (data ?? []) as Row[];

        if (reset) {
          setRows(newRows);
        } else {
          setRows((prev) => [...prev, ...newRows]);
        }

        if (reset) {
          setEnd(newRows.length < LIMIT);
        } else if (newRows.length < LIMIT) {
          setEnd(true);
        }

        const last = newRows[newRows.length - 1];
        setCursor(last?.last_msg_at ?? null);
      } catch (err) {
        console.error("list_inbox exception", err);
        setErrorMessage(err instanceof Error ? err.message : "Failed to load inbox");
        if (reset) {
          setRows([]);
          setCursor(null);
          setEnd(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [sb, campaignId, filters, search, cursor, end, loading]
  );

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCursor(null);
      setEnd(false);
      void load(true);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, search]);

  const toggleFilter = (key: string) => {
    setFilters((prev) => {
      const active = prev.includes(key);
      if (active) {
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold truncate">{campaignName}</div>
        <RoleBadge role={role} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2 flex-wrap">
          {LABELS.map((label) => {
            const active = filters.includes(label.key);
            return (
              <Button
                key={label.key}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => toggleFilter(label.key)}
                className={cn("text-xs", active && "shadow")}
              >
                {label.text}
              </Button>
            );
          })}
          {filters.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilters([])}
              className="text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="rounded-2xl border">
        {rows.length === 0 && !loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No threads yet.</div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.thread_id} className="p-3 hover:bg-muted/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {row.first_name || row.last_name
                          ? `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()
                          : row.lead_email}
                      </span>
                      {row.ooo_status === "pending" && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] bg-amber-500/15 text-amber-700">
                          OOO
                          {row.ooo_due
                            ? ` until ${new Date(row.ooo_due).toLocaleDateString()}`
                            : ""}
                        </span>
                      )}
                      {row.replied && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] bg-emerald-600/10 text-emerald-700">
                          Auto-paused
                        </span>
                      )}
                      <AiBadge label={row.last_inbound_label} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.lead_email} • {row.last_preview ?? "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {row.last_msg_at ? new Date(row.last_msg_at).toLocaleString() : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="p-3 flex items-center justify-center">
          {!end ? (
            <Button size="sm" onClick={() => void load(false)} disabled={loading}>
              {loading ? "Loading…" : "Load more"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">End of list</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AiBadge({ label }: { label: string | null }) {
  if (!label || label === "not-reply") return null;

  const map: Record<string, string> = {
    reply: "Reply (AI)",
    ooa: "OOO",
    spam: "Spam",
    forward: "Fwd",
    bounce: "Bounce",
  };

  return (
    <Badge variant="outline" className="text-[11px]">
      {map[label] ?? label}
    </Badge>
  );
}

