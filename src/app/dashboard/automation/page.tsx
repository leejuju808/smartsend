"use client";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";

const triggers = ["reply", "open", "click", "time_delay"];
const actions = [
  { type: "add_tag", label: "Add Tag" },
  { type: "pause_sequence", label: "Pause Sequence" },
  { type: "send_followup", label: "Send Follow-up" },
];

export default function AutomationsPage() {
  const supabase = createClientComponentClient();
  const [rules, setRules] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("reply");
  const [action, setAction] = useState("add_tag");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("automation_rules").select("*");
      setRules(data || []);
      setLoading(false);
    })();
  }, []);

  async function createRule() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get org_id from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) {
      console.error("No org_id found for user");
      return;
    }

    await supabase.from("automation_rules").insert({
      org_id: profile.org_id,
      name,
      trigger_event: trigger,
      action: { type: action, value },
    });

    setName("");
    setValue("");
    const { data } = await supabase.from("automation_rules").select("*");
    setRules(data || []);
  }

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    await supabase
      .from("automation_rules")
      .update({ enabled })
      .eq("id", ruleId);
    
    const { data } = await supabase.from("automation_rules").select("*");
    setRules(data || []);
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    
    await supabase.from("automation_rules").delete().eq("id", ruleId);
    
    const { data } = await supabase.from("automation_rules").select("*");
    setRules(data || []);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Smart Automation Hub ⚡</h1>
      
      <div className="border rounded-2xl p-4 space-y-3 bg-white shadow-sm">
        <input
          className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Automation name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="border rounded-xl px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {triggers.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
              </option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="border rounded-xl px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {actions.map((a) => (
              <option key={a.type} value={a.type}>
                {a.label}
              </option>
            ))}
          </select>
          <input
            className="border rounded-xl px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Value (e.g. Warm Lead)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button onClick={createRule} className="px-6">Create</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {rules.map((r) => (
          <div key={r.id} className="border rounded-2xl p-3 text-sm bg-white shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <p className="font-semibold text-base">{r.name}</p>
              <div className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => toggleRule(r.id, e.target.checked)}
                  className="rounded"
                />
                <button
                  onClick={() => deleteRule(r.id)}
                  className="text-red-600 hover:text-red-800 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="text-gray-600">Trigger: {r.trigger_event}</p>
            <p className="text-gray-600">Action: {r.action?.type} → {r.action?.value}</p>
            <p className="text-xs text-gray-400 mt-2">
              Created {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
        {rules.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-500">
            <p className="text-lg">No automation rules created yet.</p>
            <p className="text-sm">Create your first rule above!</p>
          </div>
        )}
      </div>
    </div>
  );
}
