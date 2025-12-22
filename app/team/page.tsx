"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type TeamMember = {
  id: string;
  role: string;
  created_at: string;
  user_id: string;
  account_id: string;
  user: {
    email: string | null;
  };
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/members");
      const json = await res.json();
      setMembers(json.members ?? []);
    } catch (error) {
      console.error("Failed to load members", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invite = async () => {
    if (!email.trim()) {
      alert("Please enter an email address");
      return;
    }

    setInviteLoading(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        body: JSON.stringify({ email, role }),
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      
      if (res.ok && json.inviteUrl) {
        alert(`Invite link: ${json.inviteUrl}`);
        setEmail("");
      } else {
        alert(`Error: ${json.error || "Failed to send invite"}`);
      }
    } catch (error) {
      console.error("Failed to invite", error);
      alert("Failed to send invite");
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Team Members</h1>

      {/* Invite form */}
      <div className="border rounded-lg p-4 space-y-4">
        <h2 className="text-lg font-semibold">Invite Team Member</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 border p-2 text-sm rounded"
            placeholder="Invite by email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
          <select
            className="border p-2 text-sm rounded"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <Button onClick={invite} disabled={inviteLoading}>
            {inviteLoading ? "Inviting..." : "Invite"}
          </Button>
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Current Members</h2>
        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-gray-500">No team members yet</div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="border p-3 rounded flex justify-between items-center"
            >
              <div className="text-sm">
                <div className="font-medium">
                  {m.user.email || "Unknown User"}
                </div>
                <div className="text-muted-foreground text-xs capitalize">
                  {m.role}
                </div>
              </div>
              {/* Only owner can change roles (next block) */}
            </div>
          ))
        )}
      </div>
    </div>
  );
}












