"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import FiltersBar, { ReplyFilters } from "@/components/replies/FiltersBar";
import { useReplies } from "@/hooks/useReplies";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Campaign = { id: string; name: string };

export default function RepliesInboxPage() {
  const supabase = createClientComponentClient();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filters, setFilters] = useState<ReplyFilters>({ isReply: "any", onlyUnread: false, q: "" });
  const { rows, total, page, setPage, pageSize, loading, refetch } = useReplies(filters, 25);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = rows.find(r => r.id === openId);

  useEffect(() => {
    supabase.from("campaigns").select("id,name").order("name", { ascending: true }).then(({ data }) => {
      setCampaigns((data as Campaign[]) ?? []);
    });
  }, [supabase]);

  const openReply = async (id: string) => {
    setOpenId(id);
    // mark as read (optimistic)
    const idx = rows.findIndex(r => r.id === id);
    if (idx >= 0 && rows[idx].is_read === false) {
      rows[idx].is_read = true;
    }
    await supabase.from("replies").update({ is_read: true }).eq("id", id);
    refetch();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Replies Inbox ⚡</h1>
        <div className="text-sm text-muted-foreground">{loading ? "Loading…" : `${total} results`}</div>
      </div>

      <FiltersBar campaigns={campaigns} value={filters} onChange={setFilters} />

      <div className="space-y-3">
        {rows.map(r => (
          <Card key={r.id} className={cn("transition", !r.is_read && "border-2 border-yellow-500/50")}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", r.is_read ? "bg-gray-300" : "bg-amber-500")} />
                  <p className="font-medium truncate">{r.leads?.name ?? "Unknown lead"}</p>
                  {r.leads?.email && <span className="text-xs text-muted-foreground truncate">{r.leads.email}</span>}
                </div>
                <p className="text-sm mt-1 line-clamp-1">{r.subject ?? "(no subject)"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={r.is_reply ? "default" : "secondary"}>
                  {r.is_reply ? "Human Reply" : "Auto"}
                </Badge>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                <Button size="sm" onClick={() => openReply(r.id)}>Open</Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">{r.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pager */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0 || loading}>
          Prev
        </Button>
        <span className="text-sm">Page {page + 1}</span>
        <Button variant="outline" size="sm"
          onClick={() => setPage(page + 1)}
          disabled={loading || (rows.length < pageSize && (page + 1) * pageSize >= total)}>
          Next
        </Button>
      </div>

      {/* Lead Drawer */}
      <Sheet open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{opened?.subject ?? "Reply"}</SheetTitle>
            <div className="text-sm text-muted-foreground">
              {opened?.leads?.name} · {opened?.leads?.email}
            </div>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <div className="text-xs text-muted-foreground">{opened && new Date(opened.created_at).toLocaleString()}</div>
            <pre className="whitespace-pre-wrap text-sm">{opened?.body}</pre>
            {opened?.lead_id && (
              <Button asChild className="mt-3">
                <a href={`/dashboard/leads/${opened.lead_id}`}>Open Lead Profile</a>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

