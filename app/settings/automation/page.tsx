"use client";

import { useEffect, useState } from "react";

type AutoWorkflows = {
  on_reply_create_task: boolean;
  on_hot_lead_stage_change: boolean;
  on_warm_lead_stage_change: boolean;
  on_won_log_revenue: boolean;
};

export default function AutomationSettingsPage() {
  const [state, setState] = useState<AutoWorkflows | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/settings/automation");
      const json = await res.json();
      setState(json.auto_workflows);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to save");
    }
  }

  if (!state) return <div>Loading…</div>;

  function toggle(key: keyof AutoWorkflows) {
    setState((prev) => ({ ...prev!, [key]: !prev![key] }));
  }

  return (
    <div className="max-w-xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Automation</h1>
        <p className="text-xs text-gray-600 mt-1">
          Let SmartSend handle simple workflows so you don&apos;t miss hot
          roofing opportunities.
        </p>
      </div>

      <AutomationToggle
        label="Create a follow-up task when someone replies"
        description="If a homeowner replies, SmartSend will automatically create a follow-up task so you or your team call them back."
        checked={state.on_reply_create_task}
        onChange={() => toggle("on_reply_create_task")}
      />

      <AutomationToggle
        label="Move hot leads into a priority stage"
        description="When SmartSend detects a hot lead, it will mark them HOT and move them into a priority pipeline stage."
        checked={state.on_hot_lead_stage_change}
        onChange={() => toggle("on_hot_lead_stage_change")}
      />

      <AutomationToggle
        label="Move warm leads into a working stage"
        description="Warm leads will automatically move into a working/qualified pipeline stage."
        checked={state.on_warm_lead_stage_change}
        onChange={() => toggle("on_warm_lead_stage_change")}
      />

      <AutomationToggle
        label="Log revenue when you mark a job as won"
        description="When a lead is marked WON, SmartSend will log the value for your revenue stats."
        checked={state.on_won_log_revenue}
        onChange={() => toggle("on_won_log_revenue")}
      />

      <button
        onClick={save}
        disabled={saving}
        className="text-xs px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save automation"}
      </button>
    </div>
  );
}

function AutomationToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="border rounded-2xl p-3 bg-white flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[11px] text-gray-600 mt-1">{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`w-9 h-5 rounded-full flex items-center px-0.5 ${
          checked ? "bg-black" : "bg-gray-300"
        }`}
      >
        <div
          className={`h-4 w-4 rounded-full bg-white transform transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}



























































