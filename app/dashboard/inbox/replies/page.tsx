"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ReplyCategoryBadge } from "@/components/inbox/ReplyCategoryBadge";
import { cn } from "@/lib/utils";
import { Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { LeadProfileDrawer } from "@/components/leads/LeadProfileDrawer";

type ReplyRow = {
  id: string;
  campaign_id: string | null;
  lead_id: string;
  subject: string | null;
  body: string;
  received_at: string;
  ai_category: string | null;
  ai_intent: string | null;
  ai_has_meeting: boolean | null;
  leads: { email: string; company: string | null } | null;
  campaigns: { name: string | null } | null;
};

type CategoryCount = {
  ai_category: string | null;
  count: number;
};

export default function RepliesInboxPage() {
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(30);

  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [campaignId, setCampaignId] = useState<string | undefined>();
  const [hasMeeting, setHasMeeting] = useState<string>("any"); // any | true | false

  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async (opts?: { page?: number }) => {
    const nextPage = opts?.page ?? page;
    setLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    if (category && category !== "all") params.set("category", category);
    if (search) params.set("search", search);
    if (campaignId) params.set("campaignId", campaignId);
    if (hasMeeting === "true") params.set("hasMeetingIntent", "true");
    if (hasMeeting === "false") params.set("hasMeetingIntent", "false");

    try {
      const res = await fetch(`/api/inbox/replies?${params.toString()}`);
      const json = await res.json();

      if (res.ok) {
        setReplies(json.replies || []);
        setTotal(json.total || 0);
        setPage(json.page || nextPage);
        setCategoryCounts(json.categoryCounts || []);
      } else {
        console.error("Failed to load replies:", json.error);
      }
    } catch (error) {
      console.error("Error loading replies:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, campaignId, hasMeeting]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load({ page: 1 });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    setDrawerOpen(true);
  };

  const categoryLabel = (value: string | null) => {
    if (!value) return "Unlabeled";
    const map: Record<string, string> = {
      interested: "Interested",
      neutral: "Neutral",
      not_interested: "Not interested",
      out_of_office: "OOO",
      bounce: "Bounce",
      forwarded: "Forwarded",
      not_a_lead: "Not a lead",
    };
    return map[value] || value;
  };

  const categoryTotal = (value: string) => {
    if (value === "all") return total;
    // Handle null category as "unlabeled"
    const row = categoryCounts.find((c) => {
      const cat = c.ai_category === null ? "unlabeled" : c.ai_category;
      return cat === value;
    });
    return row?.count ?? 0;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold">Replies</h1>
          <p className="text-xs text-muted-foreground">
            Filter by AI category, campaign, and meeting intent to triage faster.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-3 w-3" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Category chips */}
            <div className="flex flex-wrap gap-1">
              {[
                { value: "all", label: "All" },
                { value: "interested", label: "Interested" },
                { value: "neutral", label: "Neutral" },
                { value: "not_interested", label: "Not interested" },
                { value: "out_of_office", label: "OOO" },
                { value: "bounce", label: "Bounce" },
                { value: "forwarded", label: "Forwarded" },
                { value: "not_a_lead", label: "Not a lead" },
              ].map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "px-2 py-1 rounded-full text-[11px] border",
                    category === c.value
                      ? "bg-slate-100 text-slate-900 border-slate-200"
                      : "bg-slate-900 text-slate-100 border-slate-700"
                  )}
                >
                  {c.label} · {categoryTotal(c.value)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Has meeting intent */}
            <Select
              value={hasMeeting}
              onValueChange={(v) => setHasMeeting(v)}
            >
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Meeting intent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All replies</SelectItem>
                <SelectItem value="true">Meeting intent only</SelectItem>
                <SelectItem value="false">No meeting intent</SelectItem>
              </SelectContent>
            </Select>

            {/* Campaign filter (optional — can fill with your campaigns later) */}
            <Select
              value={campaignId || "all"}
              onValueChange={(v) =>
                setCampaignId(v === "all" ? undefined : v)
              }
            >
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="All campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {/* Map your campaigns here when you wire them in */}
              </SelectContent>
            </Select>

            {/* Search */}
            <form
              onSubmit={onSearchSubmit}
              className="flex items-center gap-1 flex-1 min-w-[200px]"
            >
              <div className="relative flex-1">
                <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search text, email, campaign…"
                  className="pl-6 h-8 text-xs"
                />
              </div>
              <Button type="submit" size="sm" variant="outline">
                Apply
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Inbox list */}
      <Card className="min-h-[320px]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Replies ({total})</span>
            <span className="text-[11px] text-muted-foreground">
              Page {page} of {totalPages}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground">
              Loading replies…
            </div>
          ) : replies.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              No replies found for this filter.
            </div>
          ) : (
            <div className="divide-y max-h-[520px] overflow-y-auto">
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  className="px-3 py-2 text-xs hover:bg-muted/40 cursor-pointer"
                  onClick={() => openLead(reply.lead_id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {reply.leads?.email || "Lead"}
                      </span>
                      {reply.leads?.company && (
                        <span className="text-[11px] text-muted-foreground">
                          · {reply.leads.company}
                        </span>
                      )}
                      {reply.campaigns?.name && (
                        <span className="text-[11px] text-muted-foreground">
                          · {reply.campaigns.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ReplyCategoryBadge category={reply.ai_category} />
                      {reply.ai_has_meeting && (
                        <span className="text-[10px] text-emerald-300 uppercase tracking-wide">
                          Meeting intent
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(reply.received_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {reply.ai_intent && (
                    <div className="text-[10px] text-emerald-300 mt-1">
                      AI: {reply.ai_intent}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                    {reply.body}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t text-[11px]">
              <span className="text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => load({ page: page - 1 })}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => load({ page: page + 1 })}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead 360° profile drawer */}
      <LeadProfileDrawer
        leadId={selectedLeadId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

