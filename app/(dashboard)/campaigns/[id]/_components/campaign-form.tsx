"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CampaignTargetSegmentSelect } from "@/components/campaigns/CampaignTargetSegmentSelect";
import { ListSelector } from "@/components/campaigns/ListSelector";
import { saveCampaign } from "@/app/api/campaigns/save/actions";
import { RewritePresetSelect } from "@/components/templates/rewrite-preset-select";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { QueuePreviewModal } from "@/components/campaigns/QueuePreviewModal";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBrowserClient } from "@supabase/ssr";
import { CampaignSenderField } from "@/components/campaign/CampaignSenderField";
import { OutboundEmailAccount } from "@/lib/smartsend/outbound-accounts";

const formSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  name: z.string().min(1),
  from_name: z.string().min(1),
  from_email: z.string().email(),
  subject: z.string().min(1),
  body_html: z.string().min(1),
  segment_id: z.string().uuid().nullable().optional(),
  sending_account_id: z.string().uuid().nullable().optional(), // Block 9900
  provider: z.string().nullable().optional(), // Block 8170
  provider_account_id: z.string().uuid().nullable().optional(), // Block 8170
});

type FormValues = z.infer<typeof formSchema>;

interface CampaignFormProps {
  defaultValues: FormValues;
  accountId: string;
  ownerId?: string; // optional if you want later
  onSaved?: (campaign: any) => void;
  smartlistId?: string | null;
  autoRefresh?: boolean;
  sendingAccounts?: Array<{ id: string; provider: string; from_email: string; from_name: string | null; status: string }>; // Block 9900
  outboundAccounts?: OutboundEmailAccount[]; // Block 8170
}

export function CampaignForm({ defaultValues, accountId, onSaved, smartlistId: initialSmartlistId, autoRefresh: initialAutoRefresh, sendingAccounts = [], outboundAccounts = [] }: CampaignFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const [saving, setSaving] = React.useState(false);

  // Smart rewriter state
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(null);
  const [rewriting, setRewriting] = React.useState(false);

  // SmartList state
  const [smartlistId, setSmartlistId] = React.useState<string | null>(initialSmartlistId ?? null);
  const [autoRefresh, setAutoRefresh] = React.useState(initialAutoRefresh ?? true);
  const [smartlists, setSmartlists] = React.useState<Array<{ id: string; name: string }>>([]);
  const [loadingSmartlists, setLoadingSmartlists] = React.useState(false);

  // Playbook state
  const [playbookId, setPlaybookId] = React.useState<string | null>(null);
  const [playbooks, setPlaybooks] = React.useState<Array<{ id: string; name: string }>>([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = React.useState(false);

  // Load SmartLists on mount
  React.useEffect(() => {
    async function loadSmartlists() {
      setLoadingSmartlists(true);
      try {
        const res = await fetch("/api/saved-views/list");
        if (!res.ok) {
          console.error("Failed to load SmartLists");
          return;
        }
        const data = await res.json();
        // Filter for SmartLists (smart=true, kind=saved_view)
        const smart = (data.views ?? []).filter((v: any) => v.smart === true && v.kind === "saved_view");
        setSmartlists(smart);
      } catch (err) {
        console.error("Error loading SmartLists:", err);
      } finally {
        setLoadingSmartlists(false);
      }
    }
    loadSmartlists();
  }, []);

  // Load playbooks and current playbook on mount
  React.useEffect(() => {
    async function loadPlaybooks() {
      if (!defaultValues.id) return;
      
      setLoadingPlaybooks(true);
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Load current campaign's playbook
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("ai_sdr_playbook_id")
          .eq("id", defaultValues.id)
          .single();
        
        if (campaign?.ai_sdr_playbook_id) {
          setPlaybookId(campaign.ai_sdr_playbook_id);
        }

        // Load user's playbooks
        const { data: playbooksData } = await supabase
          .from("ai_sdr_playbooks")
          .select("id, name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (playbooksData) {
          setPlaybooks(playbooksData);
        }
      } catch (err) {
        console.error("Error loading playbooks:", err);
      } finally {
        setLoadingPlaybooks(false);
      }
    }
    loadPlaybooks();
  }, [defaultValues.id]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      // Block 8170: Require sender selection
      if (!values.provider_account_id || !values.provider) {
        toast.error("Please select a sender account before saving");
        setSaving(false);
        return;
      }

      const payload: FormValues = {
        ...values,
        account_id: accountId,
        segment_id: values.segment_id ?? null,
      };

      const result = await saveCampaign(payload);

      // Attach SmartList if campaign ID exists
      if (defaultValues.id && (smartlistId || smartlistId === null)) {
        try {
          const attachRes = await fetch(`/api/campaigns/${defaultValues.id}/attach-smartlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              smartlistId: smartlistId || null,
              autoRefresh: autoRefresh,
            }),
          });

          if (!attachRes.ok) {
            console.error("Failed to attach SmartList");
          }
        } catch (err) {
          console.error("Error attaching SmartList:", err);
        }
      }

      // Update playbook if campaign ID exists
      if (defaultValues.id) {
        try {
          const playbookRes = await fetch(`/api/campaigns/${defaultValues.id}/playbook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ai_sdr_playbook_id: playbookId || null,
            }),
          });

          if (!playbookRes.ok) {
            console.error("Failed to update playbook");
          }
        } catch (err) {
          console.error("Error updating playbook:", err);
        }
      }

      toast.success("Campaign saved");
      if (onSaved) onSaved(result);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  async function handleRewrite() {
    const body = form.getValues("body_html");
    if (!body.trim()) {
      toast.error("Write an email body first");
      return;
    }
    if (!selectedPresetId) {
      toast.error("Choose a rewrite preset first");
      return;
    }

    setRewriting(true);
    try {
      const res = await fetch("/api/rewrite/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: selectedPresetId,
          text: body,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Rewrite failed");
      }

      const data = await res.json();
      const rewritten = (data.rewritten as string) ?? "";

      if (!rewritten.trim()) {
        toast.error("AI returned empty text");
        return;
      }

      form.setValue("body_html", rewritten, { shouldDirty: true });
      toast.success("Body rewritten with preset");
    } catch (err) {
      console.error(err);
      toast.error("Could not rewrite email");
    } finally {
      setRewriting(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <Input {...form.register("name")} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">From name</label>
          <Input {...form.register("from_name")} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">From email</label>
          <Input {...form.register("from_email")} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <Input {...form.register("subject")} />
        </div>
      </div>

      {/* List targeting (Block 10800 - takes highest priority) */}
      {defaultValues.id && (
        <div className="space-y-2">
          <ListSelector
            campaignId={defaultValues.id}
            value={listId}
            onChange={setListId}
          />
        </div>
      )}

      {/* SmartList targeting (takes priority over segment, but not over list) */}
      {defaultValues.id && !listId && (
        <div className="space-y-2">
          <div>
            <label className="block text-sm font-medium mb-1">SmartList (AI Auto-Updating Audience)</label>
            <select
              className="w-full border rounded-md p-2 text-sm"
              value={smartlistId ?? ""}
              onChange={(e) => setSmartlistId(e.target.value || null)}
              disabled={loadingSmartlists}
            >
              <option value="">No SmartList</option>
              {smartlists.map((sl) => (
                <option key={sl.id} value={sl.id}>
                  🤖 {sl.name}
                </option>
              ))}
            </select>
            {smartlistId && (
              <div className="flex items-center gap-2 mt-2 text-xs">
                <Checkbox
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={(checked) => setAutoRefresh(checked === true)}
                />
                <label htmlFor="auto-refresh" className="cursor-pointer">
                  Auto-refresh daily
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Segment targeting (fallback if no List or SmartList) */}
      {defaultValues.id && !listId && !smartlistId && (
        <div className="space-y-2">
          <CampaignTargetSegmentSelect
            accountId={accountId}
            campaignId={defaultValues.id}
            value={form.watch("segment_id") ?? null}
            onChange={(segmentId) => form.setValue("segment_id", segmentId)}
          />
          <div className="flex justify-end">
            <QueuePreviewModal campaignId={defaultValues.id} />
          </div>
        </div>
      )}

      {/* AI SDR Playbook selector */}
      {defaultValues.id && (
        <div className="space-y-2">
          <label className="block text-sm font-medium mb-1">AI SDR Playbook</label>
          <Select
            value={playbookId ?? ""}
            onValueChange={(value) => setPlaybookId(value || null)}
            disabled={loadingPlaybooks}
          >
            <SelectTrigger>
              <SelectValue placeholder="No playbook (default behavior)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No playbook</SelectItem>
              {playbooks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Define how Autopilot should talk to leads in this campaign.
          </p>
        </div>
      )}

      {/* Block 8170: Campaign Sender Selection */}
      {outboundAccounts.length > 0 && (
        <CampaignSenderField
          accounts={outboundAccounts}
          valueProvider={form.watch("provider") ?? null}
          valueAccountId={form.watch("provider_account_id") ?? null}
          onChange={(provider, accountId) => {
            form.setValue("provider", provider);
            form.setValue("provider_account_id", accountId);
          }}
        />
      )}

      {/* Block 9900: Sending Account selector */}
      {defaultValues.id && sendingAccounts.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium">Sending account</label>
          <Select
            value={form.watch("sending_account_id") ?? ""}
            onValueChange={(id) => form.setValue("sending_account_id", id || null)}
          >
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue placeholder="Choose a sending account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No sending account</SelectItem>
              {sendingAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.from_name || a.from_email} ({a.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            This mailbox will be used to send this campaign&apos;s sequence.
          </p>
        </div>
      )}

      {/* Smart Template Rewriter bar */}
      <div className="space-y-2">
        <RewritePresetSelect
          accountId={accountId}
          value={selectedPresetId}
          onChange={setSelectedPresetId}
        />

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex items-center gap-1 text-xs"
            onClick={handleRewrite}
            disabled={rewriting}
          >
            {rewriting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Rewriting…
              </>
            ) : (
              <>
                <Wand2 className="h-3 w-3" />
                Rewrite body with preset
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm font-medium mb-1">Body (HTML or plain text)</label>
        <Textarea
          className="font-mono"
          rows={12}
          {...form.register("body_html")}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Write your best version, then use Smart Rewriter to tighten tone and clarity without
          losing meaning.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save campaign"}
        </Button>
      </div>
    </form>
  );
}

