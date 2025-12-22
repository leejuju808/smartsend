"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Users, Lock } from "lucide-react";

type Props = {
  campaignId: string;
  initialVisibility: "team" | "private";
  isOwner: boolean;
};

export function CampaignSharingSettings({
  campaignId,
  initialVisibility,
  isOwner,
}: Props) {
  const [visibility, setVisibility] = useState<"team" | "private">(
    initialVisibility
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!isOwner) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/sharing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        console.error("sharing update error", json);
        setError(json.error || "Failed to update sharing");
      }
    } catch (err) {
      console.error("sharing update exception", err);
      setError("Failed to update sharing");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-slate-800 bg-slate-950/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-semibold">
            Campaign sharing
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Control who in your workspace can see and edit this campaign.
          </p>
        </div>
      </div>

      {!isOwner && (
        <p className="text-[10px] text-muted-foreground">
          Only the campaign owner can change sharing. You can still view this
          campaign because it&apos;s shared with your workspace.
        </p>
      )}

      <RadioGroup
        value={visibility}
        onValueChange={(v) => {
          if (isOwner) {
            setVisibility(v as "team" | "private");
          }
        }}
        className="grid gap-2 md:grid-cols-2 text-[11px]"
      >
        <label
          className={`flex items-start gap-2 rounded-md border p-2 ${
            !isOwner ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          } ${
            visibility === "team"
              ? "border-slate-500 bg-slate-900/80"
              : "border-slate-800 bg-slate-950/80"
          }`}
        >
          <RadioGroupItem
            value="team"
            className={!isOwner ? "opacity-50 cursor-not-allowed" : "mt-[2px]"}
          />
          <div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="font-medium text-[11px]">
                Shared with workspace
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Everyone in this workspace can see and work on this campaign.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-2 rounded-md border p-2 ${
            !isOwner ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          } ${
            visibility === "private"
              ? "border-slate-500 bg-slate-900/80"
              : "border-slate-800 bg-slate-950/80"
          }`}
        >
          <RadioGroupItem
            value="private"
            className={!isOwner ? "opacity-50 cursor-not-allowed" : "mt-[2px]"}
          />
          <div>
            <div className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              <span className="font-medium text-[11px]">
                Private to you
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Only you can see this campaign. Useful for drafts or experiments.
            </p>
          </div>
        </label>
      </RadioGroup>

      {error && (
        <p className="text-[10px] text-red-300">{error}</p>
      )}

      {isOwner && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 px-3 text-[10px]"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save sharing"}
          </Button>
        </div>
      )}
    </Card>
  );
}

