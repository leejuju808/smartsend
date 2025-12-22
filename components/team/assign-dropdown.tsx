"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type User = {
  id: string;
  email: string;
};

export function AssignDropdown({
  type,
  id,
  currentOwnerId,
  onAssign,
}: {
  type: "lead" | "thread";
  id: string;
  currentOwnerId?: string | null;
  onAssign?: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      // Fetch workspace members
      const res = await fetch("/api/replies/team");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.members || []);
      }
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  }

  async function assign(userId: string) {
    setAssigning(true);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, id, user_id: userId === "none" ? null : userId }),
      });

      if (res.ok) {
        onAssign?.();
      } else {
        const data = await res.json();
        console.error("Failed to assign:", data.error);
      }
    } catch (error) {
      console.error("Failed to assign:", error);
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading...</div>;
  }

  return (
    <Select
      value={currentOwnerId || "none"}
      onValueChange={assign}
      disabled={assigning}
    >
      <SelectTrigger className="w-40 text-sm">
        <SelectValue placeholder="Assign…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}










