"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/toast/ToastProvider";

export default function ShareCampaign({ campaignId }: { campaignId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canSend, setCanSend] = useState(true);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("orgId") : null;
  const { addToast } = useToast();

  useEffect(() => {
    // optional: fetch existing share to hydrate toggles
    if (orgId && campaignId) {
      fetch(`/api/campaigns/${campaignId}/share?orgId=${orgId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.share) {
            setEnabled(true);
            setCanEdit(data.share.can_edit || false);
            setCanSend(data.share.can_send !== false);
          }
        })
        .catch(() => {
          // ignore errors
        });
    }
  }, [campaignId, orgId]);

  const save = async (on: boolean) => {
    if (!orgId) {
      addToast({ title: "Error", description: "Select a team first", variant: "error" });
      return;
    }
    if (on) {
      const r = await fetch(`/api/campaigns/${campaignId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, can_edit: canEdit, can_send: canSend }),
      });
      if (!r.ok) {
        addToast({ title: "Error", description: "Share failed", variant: "error" });
        return;
      }
      addToast({ title: "Success", description: "Shared with team", variant: "success" });
    } else {
      const r = await fetch(`/api/campaigns/${campaignId}/share?orgId=${orgId}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        addToast({ title: "Error", description: "Unshare failed", variant: "error" });
        return;
      }
      addToast({ title: "Success", description: "Unshared", variant: "success" });
    }
  };

  return (
    <div className="p-3 border rounded-2xl space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Share with current team</Label>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v);
            save(v);
          }}
        />
      </div>
      {enabled && (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={canSend}
              onCheckedChange={(v) => {
                setCanSend(!!v);
                if (enabled) save(true);
              }}
            />{" "}
            Can send
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={canEdit}
              onCheckedChange={(v) => {
                setCanEdit(!!v);
                if (enabled) save(true);
              }}
            />{" "}
            Can edit
          </label>
        </div>
      )}
    </div>
  );
}

