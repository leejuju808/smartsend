// Block 19670 — Inbox Owner Controls & Settings v1
// Settings modal component for inbox preferences

"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/src/components/ui/slider";
import { Settings } from "lucide-react";

type DefaultTab = "all" | "hot" | "warm" | "follow_up";

interface InboxSettings {
  id?: string;
  user_id?: string;
  default_tab: DefaultTab;
  notify_new_hot: boolean;
  notify_new_warm: boolean;
  notify_new_follow_up: boolean;
  notify_booked: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  lead_priority_weight_hot: number;
  lead_priority_weight_warm: number;
  lead_priority_weight_followup: number;
}

interface InboxSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsSaved?: () => void;
}

export default function InboxSettingsModal({
  open,
  onOpenChange,
  onSettingsSaved,
}: InboxSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<InboxSettings>({
    default_tab: "all",
    notify_new_hot: true,
    notify_new_warm: true,
    notify_new_follow_up: true,
    notify_booked: true,
    quiet_hours_start: null,
    quiet_hours_end: null,
    lead_priority_weight_hot: 100,
    lead_priority_weight_warm: 70,
    lead_priority_weight_followup: 50,
  });

  // Load settings when modal opens
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inbox/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/inbox/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        // Show success toast
        if (typeof window !== "undefined") {
          // Simple toast notification
          const toast = document.createElement("div");
          toast.className =
            "fixed bottom-4 right-4 z-50 bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-lg text-sm text-green-800";
          toast.textContent = "Inbox settings updated.";
          document.body.appendChild(toast);
          setTimeout(() => {
            document.body.removeChild(toast);
          }, 3000);
        }

        onSettingsSaved?.();
        onOpenChange(false);
      } else {
        const error = await response.json();
        alert(`Error saving settings: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Inbox Settings
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading settings...
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Section A — Default View */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">Default View</h3>
              <div className="space-y-2">
                <Label className="text-xs text-neutral-600">Default Inbox Tab</Label>
                <div className="flex flex-wrap gap-2">
                  {(["all", "hot", "warm", "follow_up"] as DefaultTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSettings({ ...settings, default_tab: tab })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        settings.default_tab === tab
                          ? "bg-primary text-primary-foreground"
                          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      {tab === "all" ? "All" : tab === "hot" ? "Hot" : tab === "warm" ? "Warm" : "Follow-Up"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500">
                  Choose what the Inbox opens to by default
                </p>
              </div>
            </section>

            {/* Section B — Notifications */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label className="text-xs text-neutral-900">New Hot Lead Alerts</Label>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Push + in-app notifications for new hot leads
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_new_hot}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, notify_new_hot: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label className="text-xs text-neutral-900">Warm Lead Alerts</Label>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Notifications for new warm leads
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_new_warm}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, notify_new_warm: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label className="text-xs text-neutral-900">Follow-Up Required Alerts</Label>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Notifications when follow-up is needed
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_new_follow_up}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, notify_new_follow_up: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Label className="text-xs text-neutral-900">Booked Estimate Alerts</Label>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Notifications when leads book estimates
                    </p>
                  </div>
                  <Switch
                    checked={settings.notify_booked}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, notify_booked: checked })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Section C — Quiet Hours */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">Quiet Hours</h3>
              <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <Label className="text-xs text-neutral-600">
                  Do not send push notifications between:
                </Label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-neutral-600 mb-1 block">Start</Label>
                    <input
                      type="time"
                      value={settings.quiet_hours_start || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, quiet_hours_start: e.target.value || null })
                      }
                      className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="pt-6 text-neutral-400">→</div>
                  <div className="flex-1">
                    <Label className="text-xs text-neutral-600 mb-1 block">End</Label>
                    <input
                      type="time"
                      value={settings.quiet_hours_end || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, quiet_hours_end: e.target.value || null })
                      }
                      className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  Follow-up notifications and new lead alerts will be delayed until quiet hours end
                </p>
              </div>
            </section>

            {/* Section D — Lead Priorities */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-900">Lead Priorities (Advanced)</h3>
              <p className="text-xs text-neutral-500">
                Control how threads are ranked when sorting by priority
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-neutral-900">Hot Lead Weight</Label>
                    <span className="text-xs font-medium text-neutral-700">
                      {settings.lead_priority_weight_hot}
                    </span>
                  </div>
                  <Slider
                    value={[settings.lead_priority_weight_hot]}
                    onValueChange={(value) =>
                      setSettings({ ...settings, lead_priority_weight_hot: value[0] })
                    }
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-neutral-900">Warm Lead Weight</Label>
                    <span className="text-xs font-medium text-neutral-700">
                      {settings.lead_priority_weight_warm}
                    </span>
                  </div>
                  <Slider
                    value={[settings.lead_priority_weight_warm]}
                    onValueChange={(value) =>
                      setSettings({ ...settings, lead_priority_weight_warm: value[0] })
                    }
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-neutral-900">Follow-Up Weight</Label>
                    <span className="text-xs font-medium text-neutral-700">
                      {settings.lead_priority_weight_followup}
                    </span>
                  </div>
                  <Slider
                    value={[settings.lead_priority_weight_followup]}
                    onValueChange={(value) =>
                      setSettings({ ...settings, lead_priority_weight_followup: value[0] })
                    }
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

