"use client";

// Block 87000 — Phone Settings Client Component
// Interactive settings form

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PhoneSettings {
  id?: string;
  company_id?: string;
  org_id?: string;
  workspace_id?: string;
  greeting?: string;
  script?: string;
  fallback_number?: string;
  capture_name?: boolean;
  capture_address?: boolean;
  capture_issue?: boolean;
  capture_phone?: boolean;
  capture_email?: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  business_days?: number[];
  timezone?: string;
  after_hours_enabled?: boolean;
  after_hours_message?: string;
  storm_mode_enabled?: boolean;
  storm_mode_active?: boolean;
  storm_mode_message?: string;
  auto_create_lead?: boolean;
  auto_create_lead_on_missed?: boolean;
  auto_create_lead_on_ai_answered?: boolean;
  auto_create_lead_on_voicemail?: boolean;
  high_intent_keywords?: string[];
  medium_intent_keywords?: string[];
}

interface PhoneNumber {
  id: string;
  number: string;
  call_forwarding_number?: string;
  ai_assistant_enabled: boolean;
  text_back_enabled: boolean;
}

export default function PhoneSettingsClient({
  initialSettings,
  phoneNumbers,
  workspaceId,
}: {
  initialSettings: PhoneSettings | null;
  phoneNumbers: PhoneNumber[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<PhoneSettings>(
    initialSettings || {
      greeting: "Hi, thanks for calling [Company Name]. How can we help with your roof today?",
      capture_name: true,
      capture_address: true,
      capture_issue: true,
      capture_phone: true,
      business_hours_start: "08:00:00",
      business_hours_end: "18:00:00",
      business_days: [1, 2, 3, 4, 5],
      timezone: "America/Chicago",
      after_hours_enabled: true,
      after_hours_message: "We're closed right now, but I can still get you scheduled for an inspection. What happened to your roof?",
      storm_mode_enabled: true,
      storm_mode_active: false,
      storm_mode_message: "We're currently helping many homeowners after last night's storm. We can get you scheduled for an inspection today or tomorrow — what works best?",
      auto_create_lead: true,
      auto_create_lead_on_missed: true,
      auto_create_lead_on_ai_answered: true,
      auto_create_lead_on_voicemail: true,
      high_intent_keywords: ["leak", "emergency", "urgent", "storm", "damage", "water", "now", "today"],
      medium_intent_keywords: ["estimate", "quote", "inspection", "repair", "replace"],
      workspace_id: workspaceId,
    }
  );

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/phone/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      router.refresh();
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Assigned Phone Numbers */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Assigned Phone Numbers</h2>
        {phoneNumbers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No phone numbers configured. Add a phone number to get started.
          </p>
        ) : (
          <div className="space-y-4">
            {phoneNumbers.map((phone) => (
              <div key={phone.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{phone.number}</span>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={phone.ai_assistant_enabled}
                        onChange={async (e) => {
                          await fetch("/api/phone/numbers", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: phone.id,
                              ai_assistant_enabled: e.target.checked,
                            }),
                          });
                          router.refresh();
                        }}
                      />
                      AI Assistant
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={phone.text_back_enabled}
                        onChange={async (e) => {
                          await fetch("/api/phone/numbers", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: phone.id,
                              text_back_enabled: e.target.checked,
                            }),
                          });
                          router.refresh();
                        }}
                      />
                      Text-Back
                    </label>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Forward to: {phone.call_forwarding_number || "Not set"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Assistant Settings */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">AI Assistant Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Greeting Message</label>
            <textarea
              value={settings.greeting || ""}
              onChange={(e) => setSettings({ ...settings, greeting: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
              placeholder="Hi, thanks for calling [Company Name]. How can we help with your roof today?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Fallback Number</label>
            <input
              type="text"
              value={settings.fallback_number || ""}
              onChange={(e) => setSettings({ ...settings, fallback_number: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="+1234567890"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Number to forward calls to if AI can't handle
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Data Capture</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.capture_name}
                  onChange={(e) => setSettings({ ...settings, capture_name: e.target.checked })}
                />
                Capture homeowner name
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.capture_address}
                  onChange={(e) => setSettings({ ...settings, capture_address: e.target.checked })}
                />
                Capture address
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.capture_issue}
                  onChange={(e) => setSettings({ ...settings, capture_issue: e.target.checked })}
                />
                Capture issue description
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Business Hours */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Business Hours</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Start Time</label>
              <input
                type="time"
                value={settings.business_hours_start || "08:00"}
                onChange={(e) => setSettings({ ...settings, business_hours_start: e.target.value + ":00" })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">End Time</label>
              <input
                type="time"
                value={settings.business_hours_end?.substring(0, 5) || "18:00"}
                onChange={(e) => setSettings({ ...settings, business_hours_end: e.target.value + ":00" })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Business Days</label>
            <div className="flex gap-4">
              {[
                { value: 1, label: "Mon" },
                { value: 2, label: "Tue" },
                { value: 3, label: "Wed" },
                { value: 4, label: "Thu" },
                { value: 5, label: "Fri" },
                { value: 6, label: "Sat" },
                { value: 0, label: "Sun" },
              ].map((day) => (
                <label key={day.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.business_days?.includes(day.value)}
                    onChange={(e) => {
                      const days = settings.business_days || [];
                      if (e.target.checked) {
                        setSettings({ ...settings, business_days: [...days, day.value] });
                      } else {
                        setSettings({
                          ...settings,
                          business_days: days.filter((d) => d !== day.value),
                        });
                      }
                    }}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Timezone</label>
            <select
              value={settings.timezone || "America/Chicago"}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="America/Chicago">Central Time</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
            </select>
          </div>
        </div>
      </section>

      {/* After-Hours Settings */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">After-Hours Mode</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.after_hours_enabled}
              onChange={(e) => setSettings({ ...settings, after_hours_enabled: e.target.checked })}
            />
            Enable after-hours mode
          </label>
          <div>
            <label className="block text-sm font-medium mb-2">After-Hours Message</label>
            <textarea
              value={settings.after_hours_message || ""}
              onChange={(e) => setSettings({ ...settings, after_hours_message: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
            />
          </div>
        </div>
      </section>

      {/* Storm Mode */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Storm Mode</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.storm_mode_enabled}
              onChange={(e) => setSettings({ ...settings, storm_mode_enabled: e.target.checked })}
            />
            Enable storm mode detection
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.storm_mode_active}
              onChange={(e) => setSettings({ ...settings, storm_mode_active: e.target.checked })}
            />
            Storm mode currently active
          </label>
          <div>
            <label className="block text-sm font-medium mb-2">Storm Mode Message</label>
            <textarea
              value={settings.storm_mode_message || ""}
              onChange={(e) => setSettings({ ...settings, storm_mode_message: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
            />
          </div>
        </div>
      </section>

      {/* Auto-Lead Creation */}
      <section className="bg-card border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Auto-Lead Creation</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.auto_create_lead}
              onChange={(e) => setSettings({ ...settings, auto_create_lead: e.target.checked })}
            />
            Automatically create leads from calls
          </label>
          {settings.auto_create_lead && (
            <div className="ml-6 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.auto_create_lead_on_missed}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_create_lead_on_missed: e.target.checked })
                  }
                />
                Create lead on missed calls
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.auto_create_lead_on_ai_answered}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_create_lead_on_ai_answered: e.target.checked })
                  }
                />
                Create lead on AI-answered calls
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.auto_create_lead_on_voicemail}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_create_lead_on_voicemail: e.target.checked })
                  }
                />
                Create lead on voicemail
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}



























