"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listLeadSavedViews, saveLeadSavedView } from "@/app/api/saved-views/leads/actions";
import { Loader2, Save, Star } from "lucide-react";
import { toast } from "sonner";

type LeadSavedView = {
  id: string;
  name: string;
  description: string | null;
  config: any;
  owner_id: string;
  created_at: string;
};

interface LeadSavedViewsBarProps {
  accountId: string;
  ownerId: string;
  /** Current filter config (segment_id, search, tags, etc.) */
  currentConfig: any;
  /** Apply a saved view's config to the page filters */
  onApplyView: (config: any) => void;
}

export function LeadSavedViewsBar({
  accountId,
  ownerId,
  currentConfig,
  onApplyView,
}: LeadSavedViewsBarProps) {
  const [views, setViews] = React.useState<LeadSavedView[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | "___NONE">("___NONE");

  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [saveDescription, setSaveDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const data = await listLeadSavedViews(accountId);
        if (mounted) setViews(data as LeadSavedView[]);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load saved views");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [accountId]);

  async function handleApply(viewId: string) {
    if (viewId === "___NONE") {
      setSelectedId("___NONE");
      return;
    }
    const view = views.find((v) => v.id === viewId);
    if (!view) return;
    setSelectedId(viewId);
    onApplyView(view.config);
  }

  async function handleSave() {
    if (!saveName.trim()) {
      toast.error("Give this saved view a name");
      return;
    }

    setSaving(true);
    try {
      const created = await saveLeadSavedView({
        account_id: accountId,
        owner_id: ownerId,
        name: saveName.trim(),
        description: saveDescription.trim() || null,
        config: currentConfig,
      });

      setViews((prev) => [created as LeadSavedView, ...prev]);
      setSelectedId(created.id);
      setSaveOpen(false);
      setSaveName("");
      setSaveDescription("");
      toast.success("Saved view created");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save view");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2">
      {/* Saved View Selector */}
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-yellow-500" />
        <Select
          value={selectedId}
          onValueChange={(value) => handleApply(value)}
          disabled={loading}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={loading ? "Loading views..." : "Saved views"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="___NONE">No saved view</SelectItem>
            {views.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Save current filters */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Save className="mr-2 h-4 w-4" />
            Save current filters
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save lead view</DialogTitle>
            <DialogDescription>
              Save your current filters (search, segment, tags, etc.) as a reusable view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. ICP Fit — SaaS 50+ employees"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <Input
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="e.g. US-based SaaS using HubSpot with high ACV"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Saved views are account-wide. Perfect for "ICP Fit", "Warm Leads", or "Recent imports".
      </p>
    </div>
  );
}

