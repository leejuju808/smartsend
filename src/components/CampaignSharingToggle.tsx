"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface CampaignSharingToggleProps {
  campaignId: string;
  workspaceId: string;
  canEdit?: boolean;
}

export function CampaignSharingToggle({ campaignId, workspaceId, canEdit = false }: CampaignSharingToggleProps) {
  const [isShared, setIsShared] = useState(true);
  const [owners, setOwners] = useState<Array<{ user_id: string; email: string | null; name: string | null }>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ user_id: string; email: string | null; name: string | null }>>([]);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSharingStatus();
    loadTeamMembers();
  }, [campaignId, workspaceId]);

  const loadSharingStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sharing`);
      if (res.ok) {
        const data = await res.json();
        setIsShared(data.is_shared);
        setOwners(data.owners || []);
        setSelectedOwnerIds(data.owners?.map((o: any) => o.user_id) || []);
      }
    } catch (error) {
      console.error("Error loading sharing status:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const res = await fetch(`/api/team/members?workspaceId=${workspaceId}`);
      if (res.ok) {
        const members = await res.json();
        setTeamMembers(members.filter((m: any) => m.accepted_at !== null));
      }
    } catch (error) {
      console.error("Error loading team members:", error);
    }
  };

  const handleToggle = async (newIsShared: boolean) => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sharing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_shared: newIsShared,
          owner_ids: newIsShared ? [] : selectedOwnerIds,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to update sharing");
        return;
      }

      setIsShared(newIsShared);
      if (newIsShared) {
        setSelectedOwnerIds([]);
        setOwners([]);
      }
    } catch (error) {
      console.error("Error updating sharing:", error);
      alert("Failed to update sharing");
    } finally {
      setSaving(false);
    }
  };

  const handleOwnerToggle = async (userId: string, checked: boolean) => {
    if (!canEdit || isShared) return;

    const newSelected = checked
      ? [...selectedOwnerIds, userId]
      : selectedOwnerIds.filter(id => id !== userId);

    setSelectedOwnerIds(newSelected);

    // Save immediately
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sharing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_shared: false,
          owner_ids: newSelected,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to update owners");
        setSelectedOwnerIds(selectedOwnerIds); // Revert
      } else {
        // Reload to get updated owner list
        await loadSharingStatus();
      }
    } catch (error) {
      console.error("Error updating owners:", error);
      setSelectedOwnerIds(selectedOwnerIds); // Revert
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Campaign Sharing</h3>
          <p className="text-sm text-gray-600">
            {isShared
              ? "This campaign is shared with all team members"
              : "This campaign is private. Only selected owners can view it."}
          </p>
        </div>
        {canEdit && (
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => handleToggle(e.target.checked)}
              disabled={saving}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">
              {isShared ? "Shared with team" : "Private"}
            </span>
          </label>
        )}
        {!canEdit && (
          <span className="text-sm text-gray-600">
            {isShared ? "Shared" : "Private"}
          </span>
        )}
      </div>

      {!isShared && canEdit && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Owners:</label>
          <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
            {teamMembers.map(member => {
              const isSelected = selectedOwnerIds.includes(member.user_id);
              const displayName = member.name || member.email || member.user_id.slice(0, 8) + "…";
              return (
                <label key={member.user_id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleOwnerToggle(member.user_id, e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{displayName}</span>
                </label>
              );
            })}
            {teamMembers.length === 0 && (
              <div className="text-sm text-gray-500">No team members available</div>
            )}
          </div>
        </div>
      )}

      {!isShared && !canEdit && owners.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Owners:</label>
          <div className="space-y-1">
            {owners.map(owner => {
              const displayName = owner.name || owner.email || owner.user_id.slice(0, 8) + "…";
              return (
                <div key={owner.user_id} className="text-sm text-gray-600">
                  {displayName}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

