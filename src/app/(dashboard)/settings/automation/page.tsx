"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AutomationSettings {
  // Lead scoring
  hot_lead_threshold: number;
  warm_lead_threshold: number;
  high_probability_threshold: number;
  high_value_threshold: number;

  // Follow-up & resurrection
  auto_followup_delay_hours: number;
  max_auto_followups: number;
  resurrect_never_replied: boolean;
  resurrect_ghosted: boolean;
  resurrect_past_customers: boolean;
  resurrection_cooldown_days: number;

  // Routing & handoff
  auto_assign_new_leads: boolean;
  routing_mode: string;
  max_active_leads_per_estimator: number;
  missed_followups_before_handoff: number;

  // Risk & alerts
  risk_engine_enabled: boolean;
  alert_on_high_risk: boolean;
  alert_on_critical_risk: boolean;
  alert_via_email: boolean;
  alert_via_sms: boolean;
  alert_via_inapp: boolean;

  // Action queue
  max_tasks_per_estimator_daily: number;
  include_follow_up_hot: boolean;
  include_follow_up_warm: boolean;
  include_send_proposal: boolean;
  include_save_critical_job: boolean;
  include_resurrection: boolean;
  include_reply_angry: boolean;
  owner_only_high_value_threshold: number;

  // Safety limits
  max_messages_per_day: number;
  max_messages_per_lead_per_day: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export default function AutomationSettingsPage() {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/automation-settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error("Failed to load settings:", error);
      setMessage("Error loading settings");
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = <K extends keyof AutomationSettings>(
    key: K,
    value: AutomationSettings[K]
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/automation-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Settings saved successfully!");
      setTimeout(() => setMessage(null), 5000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Automation Control Panel</h1>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Automation Control Panel</h1>
        <p className="text-sm text-red-400">Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Automation Control Panel</h1>
        <p className="text-sm text-gray-400">
          Control how SmartSend follows up, routes leads, and protects your jobs.
        </p>
      </div>

      {/* Lead Scoring Settings */}
      <Section title="Lead Scoring">
        <SliderRow
          label="Hot Lead Threshold"
          value={settings.hot_lead_threshold}
          min={70}
          max={100}
          onChange={(val) => updateSetting("hot_lead_threshold", val)}
          description="Heat score where a lead is treated as HOT."
        />
        <SliderRow
          label="Warm Lead Threshold"
          value={settings.warm_lead_threshold}
          min={40}
          max={79}
          onChange={(val) => updateSetting("warm_lead_threshold", val)}
          description="Heat score where a lead is treated as WARM."
        />
        <SliderRow
          label="High Probability Threshold"
          value={settings.high_probability_threshold}
          min={50}
          max={100}
          onChange={(val) => updateSetting("high_probability_threshold", val)}
          description="Above this %, jobs are treated as likely to close."
        />
        <InputRow
          label="High-Value Job Threshold ($)"
          type="number"
          value={settings.high_value_threshold}
          min={5000}
          max={50000}
          onChange={(val) => updateSetting("high_value_threshold", parseFloat(val) || 10000)}
          description="Job value threshold for high-value detection."
        />
      </Section>

      {/* Follow-Up & Resurrection Settings */}
      <Section title="Follow-Up & Resurrection">
        <SelectRow
          label="Auto Follow-Up Delay (Hours)"
          value={String(settings.auto_followup_delay_hours)}
          options={[
            { value: "4", label: "4 hours" },
            { value: "8", label: "8 hours" },
            { value: "12", label: "12 hours" },
            { value: "24", label: "24 hours" },
          ]}
          onChange={(val) => updateSetting("auto_followup_delay_hours", parseInt(val))}
          description="Hours to wait before auto-follow-up after no reply."
        />
        <SliderRow
          label="Max Auto Follow-Ups Per Lead"
          value={settings.max_auto_followups}
          min={1}
          max={5}
          onChange={(val) => updateSetting("max_auto_followups", val)}
          description="Maximum number of auto follow-ups per lead."
        />
        <div className="space-y-2">
          <Label className="text-sm font-medium">Resurrection: Enable for</Label>
          <div className="space-y-2">
            <ToggleRow
              label="Leads who never replied"
              checked={settings.resurrect_never_replied}
              onChange={(val) => updateSetting("resurrect_never_replied", val)}
            />
            <ToggleRow
              label="Ghosted leads"
              checked={settings.resurrect_ghosted}
              onChange={(val) => updateSetting("resurrect_ghosted", val)}
            />
            <ToggleRow
              label="Past customers"
              checked={settings.resurrect_past_customers}
              onChange={(val) => updateSetting("resurrect_past_customers", val)}
            />
          </div>
        </div>
        <SliderRow
          label="Resurrection Cooldown (Days)"
          value={settings.resurrection_cooldown_days}
          min={7}
          max={90}
          onChange={(val) => updateSetting("resurrection_cooldown_days", val)}
          description="Days to wait between resurrection attempts."
        />
      </Section>

      {/* Routing & Handoff Settings */}
      <Section title="Routing & Handoff">
        <ToggleRow
          label="Auto-Assign New Leads"
          checked={settings.auto_assign_new_leads}
          onChange={(val) => updateSetting("auto_assign_new_leads", val)}
          description="If off, new leads stay unassigned until you pick an estimator."
        />
        <SelectRow
          label="Routing Priority Mode"
          value={settings.routing_mode}
          options={[
            { value: "balanced", label: "Balanced (performance + availability)" },
            { value: "performance", label: "Best Closer First" },
            { value: "round_robin", label: "Round Robin" },
          ]}
          onChange={(val) => updateSetting("routing_mode", val)}
        />
        <SliderRow
          label="Max Active Leads per Estimator"
          value={settings.max_active_leads_per_estimator}
          min={5}
          max={50}
          onChange={(val) => updateSetting("max_active_leads_per_estimator", val)}
        />
        <SliderRow
          label="Missed Follow-Ups Before Handoff"
          value={settings.missed_followups_before_handoff}
          min={1}
          max={5}
          onChange={(val) => updateSetting("missed_followups_before_handoff", val)}
        />
      </Section>

      {/* Risk & Alerts Settings */}
      <Section title="Risk & Alerts">
        <ToggleRow
          label="Enable Risk Engine"
          checked={settings.risk_engine_enabled}
          onChange={(val) => updateSetting("risk_engine_enabled", val)}
        />
        <ToggleRow
          label="Alert on High Risk"
          checked={settings.alert_on_high_risk}
          onChange={(val) => updateSetting("alert_on_high_risk", val)}
        />
        <ToggleRow
          label="Alert on Critical Risk"
          checked={settings.alert_on_critical_risk}
          onChange={(val) => updateSetting("alert_on_critical_risk", val)}
        />
        <div className="space-y-2">
          <Label className="text-sm font-medium">Alert Channels</Label>
          <div className="space-y-2">
            <ToggleRow
              label="Email owner"
              checked={settings.alert_via_email}
              onChange={(val) => updateSetting("alert_via_email", val)}
            />
            <ToggleRow
              label="SMS owner"
              checked={settings.alert_via_sms}
              onChange={(val) => updateSetting("alert_via_sms", val)}
            />
            <ToggleRow
              label="App notification"
              checked={settings.alert_via_inapp}
              onChange={(val) => updateSetting("alert_via_inapp", val)}
            />
          </div>
        </div>
      </Section>

      {/* Action Queue Settings */}
      <Section title="Action Queue & Priority">
        <SliderRow
          label="Max Tasks Per Estimator Per Day"
          value={settings.max_tasks_per_estimator_daily}
          min={5}
          max={40}
          onChange={(val) => updateSetting("max_tasks_per_estimator_daily", val)}
        />
        <div className="space-y-2">
          <Label className="text-sm font-medium">Task Types to Include</Label>
          <div className="space-y-2">
            <ToggleRow
              label="Follow up hot"
              checked={settings.include_follow_up_hot}
              onChange={(val) => updateSetting("include_follow_up_hot", val)}
            />
            <ToggleRow
              label="Follow up warm"
              checked={settings.include_follow_up_warm}
              onChange={(val) => updateSetting("include_follow_up_warm", val)}
            />
            <ToggleRow
              label="Send proposal"
              checked={settings.include_send_proposal}
              onChange={(val) => updateSetting("include_send_proposal", val)}
            />
            <ToggleRow
              label="Save critical job"
              checked={settings.include_save_critical_job}
              onChange={(val) => updateSetting("include_save_critical_job", val)}
            />
            <ToggleRow
              label="Revive old leads"
              checked={settings.include_resurrection}
              onChange={(val) => updateSetting("include_resurrection", val)}
            />
            <ToggleRow
              label="Reply to angry homeowners"
              checked={settings.include_reply_angry}
              onChange={(val) => updateSetting("include_reply_angry", val)}
            />
          </div>
        </div>
        <InputRow
          label="Owner-Only Tasks Threshold ($)"
          type="number"
          value={settings.owner_only_high_value_threshold}
          min={5000}
          max={50000}
          onChange={(val) => updateSetting("owner_only_high_value_threshold", parseFloat(val) || 15000)}
          description="Jobs above this value create owner-only tasks."
        />
      </Section>

      {/* Safety Limits */}
      <Section title="Email/SMS Safety Limits">
        <SliderRow
          label="Max Messages Per Day (Workspace)"
          value={settings.max_messages_per_day}
          min={50}
          max={5000}
          onChange={(val) => updateSetting("max_messages_per_day", val)}
        />
        <SliderRow
          label="Max Messages Per Lead Per Day"
          value={settings.max_messages_per_lead_per_day}
          min={1}
          max={5}
          onChange={(val) => updateSetting("max_messages_per_lead_per_day", val)}
        />
        <div className="grid grid-cols-2 gap-4">
          <InputRow
            label="Quiet Hours Start"
            type="time"
            value={settings.quiet_hours_start}
            onChange={(val) => updateSetting("quiet_hours_start", val)}
          />
          <InputRow
            label="Quiet Hours End"
            type="time"
            value={settings.quiet_hours_end}
            onChange={(val) => updateSetting("quiet_hours_end", val)}
          />
        </div>
      </Section>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

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
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  description,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-gray-300">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full"
      />
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-gray-400">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-black/40 border border-white/10 rounded-lg text-sm px-2 py-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  );
}

function InputRow({
  label,
  type,
  value,
  min,
  max,
  onChange,
  description,
}: {
  label: string;
  type: string;
  value: number | string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm">{label}</Label>
      <Input
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="bg-black/40 border border-white/10 rounded-lg text-sm px-2 py-1"
      />
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  );
}









































