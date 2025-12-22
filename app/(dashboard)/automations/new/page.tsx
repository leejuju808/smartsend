"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

type ActionType =
  | "tag"
  | "untag"
  | "stop_campaign"
  | "assign_to"
  | "send_follow_up"
  | "move_stage";

interface Action {
  type: ActionType;
  tag_id?: string;
  user_id?: string;
  step?: number;
  stage?: string;
}

export default function NewAutomationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<"reply_intent" | "no_reply">(
    "reply_intent"
  );
  const [intent, setIntent] = useState<string>("meeting_intent");
  const [delayHours, setDelayHours] = useState<number>(72);
  const [actions, setActions] = useState<Action[]>([]);
  const [currentActionType, setCurrentActionType] = useState<ActionType | "">(
    ""
  );
  const [actionStep, setActionStep] = useState<number>(2);
  const [actionStage, setActionStage] = useState<string>("");
  const [actionTagId, setActionTagId] = useState<string>("");
  const [actionUserId, setActionUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const addAction = () => {
    if (!currentActionType) return;

    let newAction: Action = { type: currentActionType };

    if (currentActionType === "send_follow_up") {
      newAction.step = actionStep;
    } else if (currentActionType === "move_stage") {
      newAction.stage = actionStage;
    } else if (currentActionType === "tag" || currentActionType === "untag") {
      newAction.tag_id = actionTagId;
    } else if (currentActionType === "assign_to") {
      newAction.user_id = actionUserId;
    }

    setActions([...actions, newAction]);
    setCurrentActionType("");
    setActionStep(2);
    setActionStage("");
    setActionTagId("");
    setActionUserId("");
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name || actions.length === 0) {
      alert("Please provide a name and at least one action");
      return;
    }

    if (trigger === "no_reply" && delayHours <= 0) {
      alert("Please provide a valid delay in hours");
      return;
    }

    if (trigger === "reply_intent" && !intent) {
      alert("Please select an intent");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/automations/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          trigger,
          condition: trigger === "reply_intent" ? { intent } : {},
          delay_hours: trigger === "no_reply" ? delayHours : 0,
          actions,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create automation");
      }

      router.push("/automations");
    } catch (error) {
      console.error("Error creating automation:", error);
      alert(
        error instanceof Error ? error.message : "Failed to create automation"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Create New Automation</h1>
        <p className="text-gray-600">
          Set up time-based automations for your campaigns
        </p>
      </div>

      <div className="border rounded-2xl p-6 space-y-4 bg-white shadow-sm">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Automation Name
          </label>
          <Input
            placeholder="e.g. If no reply after 3 days → send follow-up"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Trigger Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Trigger Type</label>
          <Select value={trigger} onValueChange={(v) => setTrigger(v as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Select trigger type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reply_intent">
                When reply intent detected
              </SelectItem>
              <SelectItem value="no_reply">
                If no reply after X hours
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Intent Condition (for reply_intent trigger) */}
        {trigger === "reply_intent" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Reply Intent
            </label>
            <Select value={intent} onValueChange={setIntent}>
              <SelectTrigger>
                <SelectValue placeholder="Select intent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting_intent">Meeting Intent</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
                <SelectItem value="out_of_office">Out of Office</SelectItem>
                <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Automation will trigger when reply intent is detected as "{intent}"
            </p>
          </div>
        )}

        {/* Delay Hours (for no_reply trigger) */}
        {trigger === "no_reply" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Delay (hours)
            </label>
            <Input
              type="number"
              placeholder="Hours (e.g. 72 for 3 days)"
              value={delayHours}
              onChange={(e) => setDelayHours(Number(e.target.value))}
              min={1}
            />
            <p className="text-xs text-gray-500 mt-1">
              {delayHours > 0
                ? `Automation will trigger ${delayHours} hours (${(
                    delayHours / 24
                  ).toFixed(1)} days) after initial send with no reply`
                : ""}
            </p>
          </div>
        )}

        {/* Actions */}
        <div>
          <label className="block text-sm font-medium mb-2">Actions</label>
          <div className="space-y-3">
            {actions.map((action, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <span className="font-medium capitalize">
                    {action.type.replace("_", " ")}
                  </span>
                  {action.step && (
                    <span className="text-gray-600 ml-2">
                      (Step {action.step})
                    </span>
                  )}
                  {action.stage && (
                    <span className="text-gray-600 ml-2">
                      (Stage: {action.stage})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeAction(index)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}

            {/* Add Action Form */}
            <div className="border-t pt-3 space-y-3">
              <Select
                value={currentActionType}
                onValueChange={(v) => setCurrentActionType(v as ActionType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag">Add tag</SelectItem>
                  <SelectItem value="untag">Remove tag</SelectItem>
                  <SelectItem value="stop_campaign">Stop campaign</SelectItem>
                  <SelectItem value="send_follow_up">Send follow-up</SelectItem>
                  <SelectItem value="move_stage">Move to stage</SelectItem>
                  <SelectItem value="assign_to">Assign to user</SelectItem>
                </SelectContent>
              </Select>

              {currentActionType === "send_follow_up" && (
                <Input
                  type="number"
                  placeholder="Follow-up step number"
                  value={actionStep}
                  onChange={(e) => setActionStep(Number(e.target.value))}
                  min={1}
                />
              )}

              {currentActionType === "move_stage" && (
                <Input
                  placeholder="Stage name"
                  value={actionStage}
                  onChange={(e) => setActionStage(e.target.value)}
                />
              )}

              {(currentActionType === "tag" ||
                currentActionType === "untag") && (
                <Input
                  placeholder="Tag ID"
                  value={actionTagId}
                  onChange={(e) => setActionTagId(e.target.value)}
                />
              )}

              {currentActionType === "assign_to" && (
                <Input
                  placeholder="User ID"
                  value={actionUserId}
                  onChange={(e) => setActionUserId(e.target.value)}
                />
              )}

              {currentActionType && (
                <Button onClick={addAction} className="w-full">
                  Add Action
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSubmit}
            disabled={saving || !name || actions.length === 0}
            className="flex-1"
          >
            {saving ? "Creating..." : "Create Automation"}
          </Button>
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

