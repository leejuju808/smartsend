"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface ScoringSettingsProps {
  canEdit: boolean;
}

export default function ScoringSettings({ canEdit }: ScoringSettingsProps) {
  const [emailOpen, setEmailOpen] = useState(2);
  const [emailClick, setEmailClick] = useState(5);
  const [reply, setReply] = useState(15);
  const [meetingIntent, setMeetingIntent] = useState(25);
  const [dealCreated, setDealCreated] = useState(10);
  const [dealStageMoved, setDealStageMoved] = useState(5);
  const [dealWon, setDealWon] = useState(40);
  const [dailyDecay, setDailyDecay] = useState(-1);
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      
      if (data.settings?.scoring) {
        setEmailOpen(data.settings.scoring.email_open || 2);
        setEmailClick(data.settings.scoring.email_click || 5);
        setReply(data.settings.scoring.reply || 15);
        setMeetingIntent(data.settings.scoring.meeting_intent || 25);
        setDealCreated(data.settings.scoring.deal_created || 10);
        setDealStageMoved(data.settings.scoring.deal_stage_moved || 5);
        setDealWon(data.settings.scoring.deal_won || 40);
        setDailyDecay(data.settings.scoring.daily_decay || -1);
        setMinScore(data.settings.scoring.min || 0);
        setMaxScore(data.settings.scoring.max || 100);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoring: {
            email_open: emailOpen,
            email_click: emailClick,
            reply: reply,
            meeting_intent: meetingIntent,
            deal_created: dealCreated,
            deal_stage_moved: dealStageMoved,
            deal_won: dealWon,
            daily_decay: dailyDecay,
            min: minScore,
            max: maxScore,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Settings saved! Changes will apply on next scoring engine pass.");
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Lead Scoring Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Lead Scoring Settings</h1>
        <p className="text-sm text-gray-600">
          Configure point values for lead scoring events
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Open
            </label>
            <Input
              type="number"
              value={emailOpen}
              onChange={(e) => setEmailOpen(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Click
            </label>
            <Input
              type="number"
              value={emailClick}
              onChange={(e) => setEmailClick(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reply
            </label>
            <Input
              type="number"
              value={reply}
              onChange={(e) => setReply(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Intent
            </label>
            <Input
              type="number"
              value={meetingIntent}
              onChange={(e) => setMeetingIntent(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deal Created
            </label>
            <Input
              type="number"
              value={dealCreated}
              onChange={(e) => setDealCreated(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deal Stage Moved
            </label>
            <Input
              type="number"
              value={dealStageMoved}
              onChange={(e) => setDealStageMoved(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Deal Won
            </label>
            <Input
              type="number"
              value={dealWon}
              onChange={(e) => setDealWon(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Daily Decay
            </label>
            <Input
              type="number"
              value={dailyDecay}
              onChange={(e) => setDailyDecay(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
            <p className="mt-1 text-xs text-gray-500">Negative value for decay</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Score
            </label>
            <Input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Score
            </label>
            <Input
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}








