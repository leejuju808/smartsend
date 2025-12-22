import AiSettingsClient from "./AiSettingsClient";

export default function AiSettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <AiSettingsClient />
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type NudgeRow = {
  id: string;
  label: string;
  tone: string;
  success_count: number;
  fail_count: number;
  weight: number;
  last_used_at: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatLastUsed(value: string | null) {
  if (!value) return "—";
  try {
    return DATE_FMT.format(new Date(value));
  } catch {
    return "—";
  }
}

export default async function AiSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("nudge_tuner")
    .select("id,label,tone,success_count,fail_count,weight,last_used_at,owner_id")
    .or(`owner_id.eq.${user.id},owner_id.is.null`)
    .order("weight", { ascending: false });

  if (error) {
    console.error("Failed to load nudge tuner stats", error);
  }

  const rows = (data as (NudgeRow & { owner_id: string | null })[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">LLM Nudge Performance</h1>
        <p className="text-gray-600">
          Track how each tone performs when SmartSend nudges leads. Success is defined as a
          positive reply, meeting intent, or neutral acknowledgement.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No nudge feedback yet. Once nudges start running, performance data will appear here.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Tone</th>
                <th className="px-4 py-3 text-right">Success</th>
                <th className="px-4 py-3 text-right">Fail</th>
                <th className="px-4 py-3 text-right">Weight</th>
                <th className="px-4 py-3">Last Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                  <td className="px-4 py-3 text-gray-700 capitalize">{row.tone}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{row.success_count}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{row.fail_count}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {row.weight.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatLastUsed(row.last_used_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

