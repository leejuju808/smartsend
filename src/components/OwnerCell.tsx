"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface OwnerCellProps {
  value: string | null; // owner_id
  onChange: (userId: string | null) => void;
  workspaceId: string;
  canEdit?: boolean;
}

export function OwnerCell({ value, onChange, workspaceId, canEdit = true }: OwnerCellProps) {
  const [teamMembers, setTeamMembers] = useState<Array<{ user_id: string; email: string | null; name: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const loadMembers = async () => {
      setLoading(true);
      try {
        // Fetch team members from the API
        const res = await fetch(`/api/team/members?workspaceId=${workspaceId}`);
        if (res.ok) {
          const members = await res.json();
          setTeamMembers(members.filter((m: any) => m.accepted_at !== null)); // Only show accepted members
        }
      } catch (error) {
        console.error("Error loading team members:", error);
      } finally {
        setLoading(false);
      }
    };
    if (workspaceId) {
      loadMembers();
    }
  }, [workspaceId]);

  const handleChange = async (newUserId: string) => {
    if (!canEdit) return;
    setUpdating(true);
    try {
      const userId = newUserId === "none" ? null : newUserId;
      onChange(userId);
    } catch (error) {
      console.error("Error updating owner:", error);
    } finally {
      setUpdating(false);
    }
  };

  const getOwnerName = () => {
    if (!value) return "Unassigned";
    const member = teamMembers.find(m => m.user_id === value);
    return member?.name || member?.email || value.slice(0, 8) + "…";
  };

  if (loading) {
    return <span className="text-xs text-gray-400">Loading...</span>;
  }

  if (!canEdit) {
    return (
      <span className="text-xs text-gray-600">
        {value ? getOwnerName() : "Unassigned"}
      </span>
    );
  }

  return (
    <select
      className="text-xs border rounded px-2 py-1 min-w-[100px]"
      value={value || "none"}
      onChange={(e) => handleChange(e.target.value)}
      disabled={updating}
      onClick={(e) => e.stopPropagation()}
    >
      <option value="none">Unassigned</option>
      {teamMembers.map(member => (
        <option key={member.user_id} value={member.user_id}>
          {member.name || member.email || member.user_id.slice(0, 8) + "…"}
        </option>
      ))}
    </select>
  );
}

