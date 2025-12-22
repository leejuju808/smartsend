"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/src/components/ui/table";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/src/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { Label } from "@/src/components/ui/label";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TriageItem = {
  id: string;
  queue_id: string;
  account_id: string;
  status: string;
  reasons: string[];
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  queue: {
    subject: string;
    to_email: string;
    sender_email: string;
    preflight_score: number;
    held_at: string;
    campaign_id: string | null;
  };
};

const REASON_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  too_many_links: { label: "Too Many Links", variant: "secondary" },
  short_url_detected: { label: "Short URL", variant: "secondary" },
  spam_phrase: { label: "Spam Phrase", variant: "destructive" },
  all_caps_subject: { label: "All Caps", variant: "secondary" },
  no_unsubscribe: { label: "No Unsubscribe", variant: "secondary" },
  domain_blocklisted: { label: "Blocked Domain", variant: "destructive" },
  domain_unhealthy: { label: "Unhealthy Domain", variant: "destructive" },
  warmup_gate: { label: "Warmup Gate", variant: "secondary" },
  too_long: { label: "Too Long", variant: "secondary" },
  too_short: { label: "Too Short", variant: "secondary" },
  missing_from: { label: "Missing From", variant: "destructive" },
};

export default function TriagePage() {
  const [items, setItems] = useState<TriageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    accountId: "",
    reason: "",
    claimed: "", // "yes" | "no" | "mine" | ""
  });
  const [fixDrawerOpen, setFixDrawerOpen] = useState(false);
  const [fixAction, setFixAction] = useState("");
  const [fixValue, setFixValue] = useState("");
  const [applyingFix, setApplyingFix] = useState(false);
  const [note, setNote] = useState("");
  const [reviewItem, setReviewItem] = useState<TriageItem | null>(null);
  const [aiFixControls, setAiFixControls] = useState<{
    tone: "friendly" | "professional" | "casual";
    length: "short" | "medium" | "long";
    cta_style: "soft" | "direct";
    max_links: number;
    add_unsubscribe: boolean;
  }>({
    tone: "professional",
    length: "short",
    cta_style: "soft",
    max_links: 2,
    add_unsubscribe: true,
  });
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<{
    rewriteId: string;
    applied: boolean;
    before: any;
    after: any;
    decisionAfter: string;
    scoreAfter: number;
    autoApplied: boolean;
  } | null>(null);
  const [queueDetails, setQueueDetails] = useState<{
    subject: string;
    body_html: string;
    rewritten_subject?: string;
    rewritten_html?: string;
  } | null>(null);

  const loadItems = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("triage_items")
        .select(`
          id,
          queue_id,
          account_id,
          status,
          reasons,
          claimed_by,
          claimed_at,
          created_at,
          queue:send_queue!inner(
            subject,
            to_email,
            sender_email,
            preflight_score,
            held_at,
            campaign_id
          )
        `)
        .in("status", ["open", "in_review", "fixed"]);

      if (filters.accountId) {
        query = query.eq("account_id", filters.accountId);
      }

      if (filters.claimed === "yes") {
        query = query.not("claimed_by", "is", null);
      } else if (filters.claimed === "no") {
        query = query.is("claimed_by", null);
      } else if (filters.claimed === "mine") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.eq("claimed_by", user.id);
        }
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      // Filter by reason if specified
      let filtered = data || [];
      if (filters.reason) {
        filtered = filtered.filter((item: TriageItem) =>
          item.reasons.includes(filters.reason)
        );
      }

      setItems(filtered as TriageItem[]);
    } catch (err) {
      console.error("Error loading triage items:", err);
      toast.error("Failed to load triage items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [filters]);

  const handleClaim = async () => {
    if (selected.size === 0) {
      toast.error("Please select items to claim");
      return;
    }

    try {
      const res = await fetch("/api/triage/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueIds: Array.from(selected) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to claim");
      }

      toast.success(`Claimed ${selected.size} item(s)`);
      setSelected(new Set());
      loadItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to claim items");
    }
  };

  const handleRelease = async () => {
    if (selected.size === 0) {
      toast.error("Please select items to release");
      return;
    }

    try {
      const res = await fetch("/api/triage/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueIds: Array.from(selected), note }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to release");
      }

      toast.success(`Released ${selected.size} item(s)`);
      setSelected(new Set());
      setNote("");
      loadItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to release items");
    }
  };

  const handleDismiss = async () => {
    if (selected.size === 0) {
      toast.error("Please select items to dismiss");
      return;
    }

    try {
      const res = await fetch("/api/triage/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueIds: Array.from(selected), note }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to dismiss");
      }

      toast.success(`Dismissed ${selected.size} item(s)`);
      setSelected(new Set());
      setNote("");
      loadItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to dismiss items");
    }
  };

  const handleApplyFix = async () => {
    if (selected.size === 0 || !fixAction) {
      toast.error("Please select items and choose a fix action");
      return;
    }

    const firstItem = items.find((item) => selected.has(item.queue_id));
    if (!firstItem) {
      toast.error("Could not determine account");
      return;
    }

    setApplyingFix(true);
    try {
      const res = await fetch("/api/triage/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: firstItem.account_id,
          action: fixAction,
          value: fixValue,
          queueIds: Array.from(selected),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply fix");
      }

      toast.success(`Applied fix to ${selected.size} item(s)`);
      setSelected(new Set());
      setFixAction("");
      setFixValue("");
      setFixDrawerOpen(false);
      loadItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply fix");
    } finally {
      setApplyingFix(false);
    }
  };

  const toggleSelect = (queueId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(queueId)) {
      newSelected.delete(queueId);
    } else {
      newSelected.add(queueId);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((item) => item.queue_id)));
    }
  };

  const getQuickFixForReason = (reason: string) => {
    if (reason === "short_url_detected") return "allow_link_domain";
    if (reason === "warmup_gate") return "disable_warmup";
    return null;
  };

  const handleQuickFix = async (item: TriageItem, reason: string) => {
    const quickFix = getQuickFixForReason(reason);
    if (!quickFix) return;

    setSelected(new Set([item.queue_id]));
    setFixAction(quickFix);
    setFixValue("");
    setFixDrawerOpen(true);
  };

  const handleReview = async (item: TriageItem) => {
    setReviewItem(item);
    setRewriteResult(null);
    
    // Load queue details
    const { data: queue } = await supabase
      .from("send_queue")
      .select("subject, body_html, subject_effective, body_html_effective, rewrite_id")
      .eq("id", item.queue_id)
      .single();
    
    if (queue) {
      setQueueDetails({
        subject: queue.subject || "",
        body_html: queue.body_html || "",
        rewritten_subject: queue.subject_effective || undefined,
        rewritten_html: queue.body_html_effective || undefined,
      });

      // Check if there's an existing rewrite
      if (queue.rewrite_id) {
        const { data: rewrite } = await supabase
          .from("preflight_rewrites")
          .select("rewritten_subject, rewritten_html, preflight_after, decision_after, score_after, auto_applied")
          .eq("id", queue.rewrite_id)
          .single();
        
        if (rewrite) {
          setRewriteResult({
            rewriteId: queue.rewrite_id,
            applied: true,
            before: null,
            after: rewrite.preflight_after,
            decisionAfter: rewrite.decision_after || "",
            scoreAfter: rewrite.score_after || 0,
            autoApplied: rewrite.auto_applied || false,
          });
        }
      }
    }
  };

  const handleGenerateRewrite = async () => {
    if (!reviewItem) return;

    setRewriteLoading(true);
    try {
      const res = await fetch("/api/rewrites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: reviewItem.queue_id,
          controls: aiFixControls,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate rewrite");
      }

      const data = await res.json();
      setRewriteResult(data);

      // Reload queue details to get rewritten content
      const { data: queue } = await supabase
        .from("send_queue")
        .select("subject_effective, body_html_effective")
        .eq("id", reviewItem.queue_id)
        .single();

      if (queue && queue.subject_effective && queue.body_html_effective) {
        setQueueDetails((prev) => ({
          ...prev!,
          rewritten_subject: queue.subject_effective || undefined,
          rewritten_html: queue.body_html_effective || undefined,
        }));
      }

      if (data.applied) {
        toast.success("Rewrite generated and auto-applied!");
        loadItems();
      } else {
        toast.success("Rewrite generated. Review and apply manually.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate rewrite");
    } finally {
      setRewriteLoading(false);
    }
  };

  const handleApplyRewrite = async () => {
    if (!reviewItem || !rewriteResult) return;

    try {
      const res = await fetch("/api/triage/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueIds: [reviewItem.queue_id],
          note: "AI rewrite approved",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to apply rewrite");
      }

      toast.success("Rewrite applied and email released");
      setReviewItem(null);
      loadItems();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply rewrite");
    }
  };

  // Simple diff helper
  const diffLines = (a: string, b: string) => {
    const A = a.split(/\n/);
    const B = b.split(/\n/);
    return { A, B };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Triage Center</h1>
        <div className="text-sm text-muted-foreground">
          {items.length} item(s) • {selected.size} selected
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Account</label>
          <Input
            placeholder="Account ID"
            value={filters.accountId}
            onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Reason</label>
          <Select
            value={filters.reason}
            onValueChange={(value) => setFilters({ ...filters, reason: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All reasons</SelectItem>
              {Object.keys(REASON_LABELS).map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {REASON_LABELS[reason].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Claimed</label>
          <Select
            value={filters.claimed}
            onValueChange={(value) => setFilters({ ...filters, claimed: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="mine">Mine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={loadItems} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Button onClick={handleClaim} variant="outline" size="sm">
            Claim
          </Button>
          <Button onClick={() => setFixDrawerOpen(true)} variant="outline" size="sm">
            Apply Fix
          </Button>
          <Button onClick={handleRelease} variant="default" size="sm">
            Release
          </Button>
          <Button onClick={handleDismiss} variant="destructive" size="sm">
            Dismiss
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          No triage items found
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH className="w-12">
                  <Checkbox
                    checked={selected.size === items.length && items.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TH>
                <TH>Subject</TH>
                <TH>To</TH>
                <TH>Score</TH>
                <TH>Reasons</TH>
                <TH>Held At</TH>
                <TH>Claimed By</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <Checkbox
                      checked={selected.has(item.queue_id)}
                      onCheckedChange={() => toggleSelect(item.queue_id)}
                    />
                  </TD>
                  <TD className="font-medium">
                    {item.queue?.subject || "(no subject)"}
                  </TD>
                  <TD>{item.queue?.to_email || "-"}</TD>
                  <TD>
                    <Badge variant={item.queue?.preflight_score >= 70 ? "default" : "destructive"}>
                      {item.queue?.preflight_score || 0}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {item.reasons.map((reason) => {
                        const label = REASON_LABELS[reason] || { label: reason, variant: "default" as const };
                        return (
                          <Badge
                            key={reason}
                            variant={label.variant}
                            className="cursor-pointer"
                            onClick={() => handleQuickFix(item, reason)}
                            title="Click to apply quick fix"
                          >
                            {label.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </TD>
                  <TD className="text-sm text-muted-foreground">
                    {item.queue?.held_at
                      ? new Date(item.queue.held_at).toLocaleString()
                      : "-"}
                  </TD>
                  <TD className="text-sm text-muted-foreground">
                    {item.claimed_by ? "Claimed" : "Unclaimed"}
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReview(item)}
                      >
                        Review
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(new Set([item.queue_id]));
                          handleRelease();
                        }}
                      >
                        Release
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(new Set([item.queue_id]));
                          handleDismiss();
                        }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {/* Fix Drawer */}
      <Drawer open={fixDrawerOpen} onOpenChange={setFixDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Apply Fix</DrawerTitle>
          </DrawerHeader>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Fix Action</label>
              <Select value={fixAction} onValueChange={setFixAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fix action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow_link_domain">Allow link domain</SelectItem>
                  <SelectItem value="block_link_domain">Block link domain</SelectItem>
                  <SelectItem value="add_spam_phrase">Add spam phrase</SelectItem>
                  <SelectItem value="disable_warmup">Disable warmup</SelectItem>
                  <SelectItem value="enable_warmup">Enable warmup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(fixAction === "allow_link_domain" ||
              fixAction === "block_link_domain" ||
              fixAction === "add_spam_phrase") && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {fixAction === "add_spam_phrase" ? "Phrase" : "Domain"}
                </label>
                <Input
                  placeholder={
                    fixAction === "add_spam_phrase"
                      ? "Enter spam phrase"
                      : "Enter domain (e.g., example.com)"
                  }
                  value={fixValue}
                  onChange={(e) => setFixValue(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">Note (optional)</label>
              <Input
                placeholder="Add a note about this fix"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DrawerFooter>
            <Button onClick={handleApplyFix} disabled={applyingFix || !fixAction}>
              {applyingFix ? "Applying..." : "Apply Fix"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFixDrawerOpen(false);
                setFixAction("");
                setFixValue("");
              }}
            >
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Review Dialog with AI Fix */}
      <Dialog open={!!reviewItem} onOpenChange={(open) => !open && setReviewItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review & AI Fix</DialogTitle>
            <DialogDescription>
              Review email details and use AI to fix preflight issues
            </DialogDescription>
          </DialogHeader>

          {reviewItem && (
            <Tabs defaultValue="review" className="w-full">
              <TabsList>
                <TabsTrigger value="review">Review</TabsTrigger>
                <TabsTrigger value="ai-fix">AI Fix</TabsTrigger>
              </TabsList>

              <TabsContent value="review" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">To</div>
                    <div>{reviewItem.queue?.to_email || "-"}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Score</div>
                    <Badge variant={reviewItem.queue?.preflight_score >= 70 ? "default" : "destructive"}>
                      {reviewItem.queue?.preflight_score || 0}
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Subject</div>
                  <div className="p-2 bg-muted rounded">{reviewItem.queue?.subject || "—"}</div>
                </div>

                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Reasons</div>
                  <div className="flex flex-wrap gap-2">
                    {reviewItem.reasons.map((reason) => {
                      const label = REASON_LABELS[reason] || { label: reason, variant: "default" as const };
                      return (
                        <Badge key={reason} variant={label.variant}>
                          {label.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {queueDetails && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">Body HTML</div>
                    <div className="p-2 bg-muted rounded text-sm max-h-40 overflow-y-auto" dangerouslySetInnerHTML={{ __html: queueDetails.body_html }} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ai-fix" className="space-y-4">
                {rewriteResult?.autoApplied && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-600">Auto-fixed by AI</Badge>
                      <span className="text-sm text-muted-foreground">
                        Score improved from {rewriteResult.before?.score || "?"} to {rewriteResult.scoreAfter}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tone</Label>
                    <Select
                      value={aiFixControls.tone}
                      onValueChange={(v: "friendly" | "professional" | "casual") =>
                        setAiFixControls({ ...aiFixControls, tone: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Length</Label>
                    <Select
                      value={aiFixControls.length}
                      onValueChange={(v: "short" | "medium" | "long") =>
                        setAiFixControls({ ...aiFixControls, length: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>CTA Style</Label>
                    <Select
                      value={aiFixControls.cta_style}
                      onValueChange={(v: "soft" | "direct") =>
                        setAiFixControls({ ...aiFixControls, cta_style: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soft">Soft</SelectItem>
                        <SelectItem value="direct">Direct</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Max Links</Label>
                    <Select
                      value={String(aiFixControls.max_links)}
                      onValueChange={(v) =>
                        setAiFixControls({ ...aiFixControls, max_links: parseInt(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={aiFixControls.add_unsubscribe}
                    onCheckedChange={(checked) =>
                      setAiFixControls({ ...aiFixControls, add_unsubscribe: checked === true })
                    }
                  />
                  <Label>Add unsubscribe line</Label>
                </div>

                <Button
                  onClick={handleGenerateRewrite}
                  disabled={rewriteLoading}
                  className="w-full"
                >
                  {rewriteLoading ? "Generating..." : "Generate Rewrite"}
                </Button>

                {rewriteResult && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Preflight Before</p>
                        <p className="text-sm">
                          <b>{rewriteResult.before?.score || "?"}</b> — {rewriteResult.before?.decision || "?"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Preflight After</p>
                        <p className="text-sm">
                          <b>{rewriteResult.scoreAfter}</b> — {rewriteResult.decisionAfter}
                        </p>
                      </div>
                    </div>

                    {queueDetails?.rewritten_subject && (
                      <div>
                        <div className="text-sm font-medium mb-2">Subject Comparison</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2 bg-muted rounded text-sm">
                            <div className="text-xs text-muted-foreground mb-1">Original</div>
                            {queueDetails.subject}
                          </div>
                          <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm border border-green-200 dark:border-green-800">
                            <div className="text-xs text-muted-foreground mb-1">Rewritten</div>
                            {queueDetails.rewritten_subject}
                          </div>
                        </div>
                      </div>
                    )}

                    {queueDetails?.rewritten_html && (
                      <div>
                        <div className="text-sm font-medium mb-2">Body Comparison</div>
                        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                          <div className="p-2 bg-muted rounded text-sm">
                            <div className="text-xs text-muted-foreground mb-1">Original</div>
                            <div dangerouslySetInnerHTML={{ __html: queueDetails.body_html }} />
                          </div>
                          <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm border border-green-200 dark:border-green-800">
                            <div className="text-xs text-muted-foreground mb-1">Rewritten</div>
                            <div dangerouslySetInnerHTML={{ __html: queueDetails.rewritten_html }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {!rewriteResult.applied && (
                      <div className="flex gap-2">
                        <Button onClick={handleApplyRewrite} className="flex-1">
                          Apply & Release
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setReviewItem(null)}
                          className="flex-1"
                        >
                          Keep Held
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewItem(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

