"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Info } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

interface AutoReplyToggleProps {
  campaignId: string;
}

export default function AutoReplyToggle({ campaignId }: AutoReplyToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadSettings();
  }, [campaignId]);

  async function loadSettings() {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/auto-reply`);
      const data = await response.json();
      
      if (data.campaign) {
        setEnabled(data.campaign.allow_auto_reply || false);
        setConfidenceThreshold(data.campaign.auto_reply_confidence_threshold || 0.8);
      }
    } catch (error) {
      console.error("Error loading auto-reply settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(newValue: boolean) {
    setSaving(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/auto-reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allow_auto_reply: newValue,
          auto_reply_confidence_threshold: confidenceThreshold,
        }),
      });

      if (!response.ok) throw new Error("Failed to update");

      setEnabled(newValue);

      // Create notification
      await supabase.from("notifications").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        type: newValue ? "auto_reply_enabled" : "auto_reply_disabled",
        severity: "info",
        title: newValue ? "Auto-reply enabled" : "Auto-reply disabled",
        message: `Auto-reply ${newValue ? "enabled" : "disabled"} for campaign`,
        action_url: `/dashboard/campaigns/${campaignId}`,
        sent_email: false,
      });
    } catch (error) {
      console.error("Error updating auto-reply settings:", error);
      alert("Failed to update auto-reply settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfidenceChange(value: number[]) {
    const newThreshold = value[0];
    setConfidenceThreshold(newThreshold);
    
    if (enabled) {
      setSaving(true);
      try {
        await fetch(`/api/campaigns/${campaignId}/auto-reply`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allow_auto_reply: enabled,
            auto_reply_confidence_threshold: newThreshold,
          }),
        });
      } catch (error) {
        console.error("Error updating confidence threshold:", error);
      } finally {
        setSaving(false);
      }
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <div className="flex-1">
          <Label htmlFor="auto-reply-toggle" className="text-base font-semibold">
            AI Auto-Reply Agent
          </Label>
          <p className="text-sm text-gray-600">
            Automatically generate and send replies when prospects respond
          </p>
        </div>
        <Switch
          id="auto-reply-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
      </div>

      {enabled && (
        <div className="ml-8 space-y-3 pt-2 border-t">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Confidence Threshold
              </Label>
              <Badge variant="secondary">
                {(confidenceThreshold * 100).toFixed(0)}%
              </Badge>
            </div>
            <Slider
              value={[confidenceThreshold]}
              onValueChange={handleConfidenceChange}
              min={0.5}
              max={0.95}
              step={0.05}
              className="w-full"
              disabled={saving}
            />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Info className="h-3 w-3" />
              <span>
                Replies with confidence ≥ {(confidenceThreshold * 100).toFixed(0)}% will be sent automatically.
                Lower confidence replies will be suggested for review.
              </span>
            </div>
          </div>

          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
            <strong>How it works:</strong> When a prospect replies, AI analyzes the message and generates a 
            personalized response. High-confidence replies are sent automatically; others are saved for your review.
          </div>
        </div>
      )}
    </div>
  );
}

