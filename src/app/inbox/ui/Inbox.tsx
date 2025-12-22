"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import ThreadList from "./ThreadList";
import ThreadPane from "./ThreadPane";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { useBillingAccount } from "@/hooks/useBillingAccount";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast/ToastProvider";

type Thread = {
  id: string;
  campaign_id: string;
  lead_id: string;
  updated_at: string;
  replied_at: string | null;
  replied_message_id: string | null;
  reply_reason: string | null;
  needs_reply: boolean | null;
  stopped_by_reply: boolean | null;
  bounced_at: string | null;
  unsubscribed_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  lead_email: string;
  lead_domain: string | null;
  last_inbound_at: string | null;
  last_inbound_id: string | null;
  last_snippet: string | null;
  last_ai_label: string | null;
  last_ai_score: number | null;
  last_ai_reason: string | null;
  sort_key: string;
};

type Filter =
  | "all"
  | "meeting"
  | "positive"
  | "question"
  | "needs"
  | "ooo"
  | "unsubscribe"
  | "bounce";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "meeting", label: "Meeting" },
  { key: "positive", label: "Positive" },
  { key: "question", label: "Question" },
  { key: "needs", label: "Needs Reply" },
  { key: "ooo", label: "OOO" },
  { key: "unsubscribe", label: "Unsub" },
  { key: "bounce", label: "Bounce" },
];

export default function Inbox() {
  const sb = useMemo(supabaseBrowser, []);
  const { account: acc, loading: billingLoading } = useBillingAccount();
  const [items, setItems] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [memberList, setMemberList] = useState<{ user_id: string; user_email: string | null }[]>([]);
  const { push: pushToast } = useToast();

  const PAGE_SIZE = 25;

  const loadMembersForCampaign = useCallback(async (campaignId: string) => {
    try {
      const { data, error } = await sb
        .from("v_campaign_members")
        .select("user_id,user_email")
        .eq("campaign_id", campaignId);

      if (error) {
        console.error("v_campaign_members error", error);
        setMemberList([]);
        return;
      }

      setMemberList((data || []) as { user_id: string; user_email: string | null }[]);
      setAssignTo("");
    } catch (err) {
      console.error("load members failed", err);
      setMemberList([]);
      setAssignTo("");
    }
  }, [sb]);

  const loadHeader = useCallback(async () => {
    if (!activeId) {
      setMemberList([]);
      return;
    }

    try {
      const { data, error } = await sb
        .from("v_inbox_threads")
        .select("campaign_id")
        .eq("id", activeId)
        .maybeSingle();

      if (error) {
        console.error("v_inbox_threads header error", error);
        setMemberList([]);
        return;
      }

      if (data?.campaign_id) {
        await loadMembersForCampaign(data.campaign_id);
      } else {
        setMemberList([]);
      }
    } catch (err) {
      console.error("load header failed", err);
      setMemberList([]);
    }
  }, [sb, activeId, loadMembersForCampaign]);

  const load = useCallback(async () => {
    try {
      const { data: threadData, error: threadError } = await sb.rpc("list_threads_filtered", {
        p_filter: filter,
        p_q: q || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });

      if (threadError) {
        console.error("list_threads_filtered error", threadError);
        setItems([]);
        setActiveId(undefined);
        setSelected(new Set());
      } else {
        const rows = (threadData ?? []) as Thread[];
        setItems(rows);
        setSelected((prev) => {
          if (prev.size === 0) {
            return prev;
          }

          const next = new Set<string>();
          rows.forEach((row: Thread) => {
            if (prev.has(row.id)) {
              next.add(row.id);
            }
          });

          return next;
        });
        if (rows.length === 0) {
          setActiveId(undefined);
        } else {
          setActiveId((current) => {
            if (current && rows.some((row) => row.id === current)) {
              return current;
            }
            return rows[0]?.id;
          });
        }
      }
    } catch (err) {
      console.error("inbox load failed", err);
    }
  }, [sb, filter, q, page]);

  useEffect(() => {
    setPage((prev) => (prev === 0 ? prev : 0));
  }, [filter, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void loadHeader();
  }, [loadHeader]);

  useEffect(() => {
    const channel = sb
      .channel("inbox-rt-filters")
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "inbox_threads" }, () => load())
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [sb, load]);

  const showBillingAlert = !billingLoading && (!acc || (acc.status !== "active" && acc.status !== "trialing"));

  const hasNextPage = items.length === PAGE_SIZE;

  const allVisibleSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const someVisibleSelected = items.some((item) => selected.has(item.id));

  function toggle(id: string, next: boolean) {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (next) {
        nextSet.add(id);
      } else {
        nextSet.delete(id);
      }
      return nextSet;
    });
  }

  function toggleAll(next: boolean) {
    if (!next) {
      setSelected(new Set());
      return;
    }

    const nextSet = new Set<string>();
    items.forEach((item) => {
      nextSet.add(item.id);
    });
    setSelected(nextSet);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkStop() {
    if (selected.size === 0) return;

    const { error } = await sb.rpc("bulk_stop_threads", { p_threads: Array.from(selected) });
    if (error) {
      console.error("bulk_stop_threads error", error);
      alert(error.message);
      return;
    }

    clearSelection();
    await load();
    pushToast({ type: "success", description: "Sequences stopped" });
  }

  async function bulkClose() {
    if (selected.size === 0) return;

    const { error } = await sb.rpc("bulk_close_threads", { p_threads: Array.from(selected) });
    if (error) {
      console.error("bulk_close_threads error", error);
      alert(error.message);
      return;
    }

    clearSelection();
    await load();
    pushToast({ type: "success", description: "Marked done" });
  }

  async function bulkAssign() {
    if (!assignTo || selected.size === 0) return;

    const { error } = await sb.rpc("bulk_assign_threads", {
      p_threads: Array.from(selected),
      p_user: assignTo,
    });

    if (error) {
      console.error("bulk_assign_threads error", error);
      alert(error.message);
      return;
    }

    clearSelection();
    setAssignTo("");
    await load();
    pushToast({ type: "success", description: "Assigned" });
  }

  const handleFilterChange = (value: Filter) => {
    if (value !== filter) {
      clearSelection();
      setFilter(value);
    }
  };

  const handleSearch = (value: string) => {
    clearSelection();
    setQ(value);
  };

  const goPrevPage = () => {
    if (page <= 0) return;
    clearSelection();
    setPage((prev) => Math.max(0, prev - 1));
  };

  const goNextPage = () => {
    if (!hasNextPage) return;
    clearSelection();
    setPage((prev) => prev + 1);
  };

  return (
    <div className="h-full flex flex-col">
      {showBillingAlert && (
        <Alert className="rounded-none border-b border-amber-200 bg-amber-50 text-amber-900">
          <AlertTitle>Upgrade to send emails</AlertTitle>
          <AlertDescription>
            Upgrade your plan to send replies. Visit <a href="/settings/billing" className="underline">Billing</a> to
            manage your subscription.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 h-full grid grid-cols-1 md:grid-cols-3">
        <div className="border-r p-3 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search email/domain…"
              value={q}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map(({ key, label }) => (
              <Button
                key={key}
                variant={filter === key ? "default" : "outline"}
                size="sm"
                onClick={() => handleFilterChange(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm opacity-70">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(value) => toggleAll(Boolean(value))}
                />
                <span>{selected.size} selected</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={bulkStop} disabled={selected.size === 0}>
                  Stop
                </Button>
                <Button variant="outline" onClick={bulkClose} disabled={selected.size === 0}>
                  Mark done
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={assignTo || undefined} onValueChange={(value) => setAssignTo(value)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Assign…" />
                </SelectTrigger>
                <SelectContent>
                  {memberList.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.user_email ?? m.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={bulkAssign} disabled={!assignTo || selected.size === 0}>
                Assign
              </Button>
            </div>
          </div>

          <ThreadList items={items} activeId={activeId} onSelect={setActiveId} selected={selected} onToggle={toggle} />

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs opacity-60">Page {page + 1}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 0}
                onClick={goPrevPage}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                disabled={!hasNextPage}
                onClick={goNextPage}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
        <div className="md:col-span-2 h-full">
          {activeId ? (
            <ThreadPane threadId={activeId} onReplied={() => load()} />
          ) : (
            <div className="p-6 opacity-60">Select a thread</div>
          )}
        </div>
      </div>
    </div>
  );
}

