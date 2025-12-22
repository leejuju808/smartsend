"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

type ItemType = "campaign" | "segment" | "template" | "lead_view";

interface TeamMember {
  id: string;
  email: string;
}

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  itemType: ItemType;
  itemId: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ShareModal({ open, onClose, itemType, itemId }: ShareModalProps) {
  const { data: teamData } = useSWR<TeamMember[]>("/api/team/list", fetcher);
  const { data: sharedData, mutate: mutateShared } = useSWR<Array<{
    id: string;
    target_user_id: string;
    access: string;
    owner_id: string;
  }>>(
    open ? `/api/shared/list?type=${itemType}` : null,
    fetcher
  );

  const [targetUser, setTargetUser] = useState<string | null>(null);
  const [access, setAccess] = useState<"view" | "edit">("view");

  const team = teamData || [];
  const sharedItems = sharedData || [];
  const currentShares = sharedItems.filter((s) => s.item_id === itemId);

  // Create a map of user_id to email for easy lookup
  const userEmailMap = new Map<string, string>();
  team.forEach((member) => {
    userEmailMap.set(member.id, member.email);
  });

  async function save() {
    if (!targetUser) {
      toast.error("Please select a teammate");
      return;
    }

    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_type: itemType,
        item_id: itemId,
        target_user_id: targetUser,
        access,
      }),
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(payload.error || "Failed to share item");
      return;
    }

    toast.success("Item shared successfully");
    setTargetUser(null);
    setAccess("view");
    mutateShared();
  }

  async function unshare(shareId: string) {
    const res = await fetch(`/api/share/${shareId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error("Failed to remove access");
      return;
    }

    toast.success("Access removed");
    mutateShared();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share with teammate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={targetUser || ""} onValueChange={setTargetUser}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {team.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={access} onValueChange={(value) => setAccess(value as "view" | "edit")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View Only</SelectItem>
                <SelectItem value="edit">Edit Access</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={save} disabled={!targetUser}>
              Share
            </Button>
          </div>

          {currentShares.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Shared with:</div>
              <div className="space-y-2 rounded-lg border p-3">
                {currentShares.map((share) => {
                  const email = userEmailMap.get(share.target_user_id) || share.target_user_id;
                  return (
                    <div key={share.id} className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">{email}</div>
                        <div className="text-xs text-muted-foreground capitalize">{share.access} access</div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unshare(share.id)}
                      >
                        Remove Access
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}










