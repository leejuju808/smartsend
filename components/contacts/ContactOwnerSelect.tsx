// Block 16300 — Lead Ownership v1
// Owner selector component for contact page

"use client";

import { useState, useEffect } from "react";

interface Member {
  user_id: string;
  email: string;
  full_name?: string | null;
  display_name?: string;
}

interface ContactOwnerSelectProps {
  contactId: string;
  currentOwnerId: string | null;
  onOwnerChange?: () => void;
}

export function ContactOwnerSelect({
  contactId,
  currentOwnerId,
  onOwnerChange,
}: ContactOwnerSelectProps) {
  const [value, setValue] = useState<string | null>(currentOwnerId);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValue(currentOwnerId);
  }, [currentOwnerId]);

  useEffect(() => {
    async function loadMembers() {
      try {
        const res = await fetch("/api/inbox/workspace-members");
        if (res.ok) {
          const data = await res.json();
          setMembers(data.members || []);
        }
      } catch (error) {
        console.error("Failed to load workspace members:", error);
      }
    }
    loadMembers();
  }, []);

  async function changeOwner(newVal: string | null) {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_user_id: newVal }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update owner");
        return;
      }

      setValue(newVal);
      if (onOwnerChange) {
        onOwnerChange();
      }
    } catch (error) {
      console.error("Failed to update owner:", error);
      alert("Failed to update owner");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Owner:</span>
      <select
        value={value || ""}
        onChange={(e) => changeOwner(e.target.value || null)}
        disabled={loading}
        className="text-[11px] border rounded-lg px-2 py-1 bg-white disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.display_name || m.full_name || m.email}
          </option>
        ))}
      </select>
    </div>
  );
}



























































