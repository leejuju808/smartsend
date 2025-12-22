"use client";

import { useState, useEffect } from "react";

type TeamMember = {
  id: string;
  email: string;
};

type AssignmentDropdownProps = {
  threadId: string;
  assignedTo: string | null;
  onAssign?: (userId: string | null) => void;
};

export function AssignmentDropdown({
  threadId,
  assignedTo,
  onAssign,
}: AssignmentDropdownProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  async function loadTeamMembers() {
    try {
      const res = await fetch("/api/team/members");
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(data.members || []);
      }
    } catch (error) {
      console.error("Failed to load team members:", error);
    }
  }

  async function assign(userId: string | null) {
    setAssigning(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        onAssign?.(userId);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to assign");
      }
    } catch (error) {
      console.error("Failed to assign:", error);
      alert("Failed to assign");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <select
      className="border p-2 rounded text-sm"
      value={assignedTo ?? ""}
      onChange={(e) => assign(e.target.value || null)}
      disabled={assigning}
    >
      <option value="">Unassigned</option>
      {teamMembers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.email}
        </option>
      ))}
    </select>
  );
}












