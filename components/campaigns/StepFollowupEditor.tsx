"use client";

import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { getFeatures } from "@/lib/billing/feature-gates";
import Link from "next/link";

type Props = {
  followupEnabled: boolean;
  followupDelayDays: number;
  followupCondition: string;
  followupSubject: string;
  followupBody: string;
  onChange: (updates: Partial<Props>) => void;
};

export function StepFollowupEditor(props: Props) {
  const {
    followupEnabled,
    followupDelayDays,
    followupCondition,
    followupSubject,
    followupBody,
    onChange,
  } = props;

  const { workspace, loading } = useCurrentWorkspace();

  if (loading || !workspace) return null;

  const features = getFeatures(workspace.plan_key as any);
  const locked = !features.autoFollowups;

  if (locked) {
    return (
      <div className="mt-3 border rounded-2xl p-3 bg-slate-50">
        <div className="text-xs font-semibold mb-1">
          Auto Follow-up (Growth & Domination)
        </div>
        <div className="text-[11px] text-gray-600 mb-2">
          SmartSend can automatically send follow-up emails when prospects
          don't reply — available on Growth and Domination plans.
        </div>
        <Link
          href="/billing"
          className="inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg border bg-white"
        >
          Upgrade to unlock
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 border rounded-2xl p-3 bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Auto Follow-up</div>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={followupEnabled}
            onChange={(e) =>
              onChange({ followupEnabled: e.target.checked })
            }
            className="hidden"
          />
          <span
            className={`w-9 h-5 flex items-center rounded-full p-0.5 ${
              followupEnabled ? "bg-black" : "bg-slate-300"
            }`}
          >
            <span
              className={`w-4 h-4 bg-white rounded-full transform transition ${
                followupEnabled ? "translate-x-4" : ""
              }`}
            />
          </span>
        </label>
      </div>

      {followupEnabled && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2 items-center">
            <span className="text-[11px] text-gray-600">Send after</span>
            <input
              type="number"
              min={1}
              value={followupDelayDays}
              onChange={(e) =>
                onChange({ followupDelayDays: Number(e.target.value) })
              }
              className="w-14 border rounded-lg px-2 py-1 text-xs"
            />
            <span className="text-[11px] text-gray-600">days if </span>
            <select
              value={followupCondition}
              onChange={(e) =>
                onChange({ followupCondition: e.target.value })
              }
              className="border rounded-lg px-2 py-1 text-[11px]"
            >
              <option value="no_reply">no reply</option>
              <option value="no_hot_or_warm">no hot/warm intent</option>
              <option value="always">always send</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold">Follow-up subject</label>
            <input
              value={followupSubject}
              onChange={(e) =>
                onChange({ followupSubject: e.target.value })
              }
              className="w-full border rounded-xl px-3 py-1.5 text-xs"
              placeholder="Re: {{contact.first_name}}, did you see my message?"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold">Follow-up body</label>
            <textarea
              value={followupBody}
              onChange={(e) =>
                onChange({ followupBody: e.target.value })
              }
              rows={4}
              className="w-full border rounded-xl px-3 py-2 text-xs font-mono"
              placeholder="Hi {{contact.first_name}},\n\nJust following up on my previous message..."
            />
          </div>

          <div className="text-[10px] text-gray-400">
            Placeholders:{" "}
            <code>{`{{contact.first_name}}`}</code>,{" "}
            <code>{`{{city}}`}</code>,{" "}
            <code>{`{{company.name}}`}</code>,{" "}
            <code>{`{{sender.signature}}`}</code>.
          </div>
        </div>
      )}
    </div>
  );
}



























































