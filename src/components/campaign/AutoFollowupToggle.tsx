// src/components/campaign/AutoFollowupToggle.tsx
// Block 186: Auto Follow-Up Toggle Component

"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AutoFollowupToggleProps {
  campaignId: string;
}

export function AutoFollowupToggle({ campaignId }: AutoFollowupToggleProps) {
  const supabase = createClientComponentClient();
  const [autoFollowup, setAutoFollowup] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [campaignId]);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from("campaigns")
        .select("auto_followup, followup_approval_required")
        .eq("id", campaignId)
        .single();

      if (error) throw error;

      setAutoFollowup(data?.auto_followup ?? false);
      setApprovalRequired(data?.followup_approval_required ?? false);
    } catch (error) {
      console.error("Error loading auto follow-up settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .update({
          auto_followup: autoFollowup,
          followup_approval_required: approvalRequired,
        })
        .eq("id", campaignId);

      if (error) throw error;

      toast.success("Auto follow-up settings saved");
    } catch (error) {
      console.error("Error saving auto follow-up settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="auto-followup"
            checked={autoFollowup}
            onCheckedChange={(checked) => {
              setAutoFollowup(!!checked);
              if (!checked) {
                setApprovalRequired(false);
              }
            }}
            disabled={saving}
          />
          <Label htmlFor="auto-followup" className="text-sm font-medium cursor-pointer">
            Enable Autonomous Follow-Ups
          </Label>
        </div>
        <p className="text-xs text-muted-foreground ml-6">
          AI will automatically generate and send follow-up emails based on thread context, tone, objections, and buyer role.
        </p>

        {autoFollowup && (
          <div className="ml-6 space-y-3 mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Checkbox
                id="approval-required"
                checked={approvalRequired}
                onCheckedChange={(checked) => setApprovalRequired(!!checked)}
                disabled={saving}
              />
              <Label htmlFor="approval-required" className="text-sm font-medium cursor-pointer">
                Require Manual Approval
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Review and approve AI-generated follow-ups before they are sent. If disabled, follow-ups will be sent automatically.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}












