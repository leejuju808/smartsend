"use client";
import { useState } from "react";

interface TeamMember {
  user_id: string;
  role: string;
  created_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string;
  };
}

interface TeamMembersListProps {
  members: TeamMember[];
  isOwner: boolean;
  myRole: string | undefined;
  teamId: string;
}

export default function TeamMembersList({ members, isOwner, myRole, teamId }: TeamMembersListProps) {
  const [removing, setRemoving] = useState<string | null>(null);

  const canRemove = (memberRole: string, memberId: string) => {
    if (!isOwner && myRole !== 'admin') return false;
    if (memberRole === 'owner') return false; // Can't remove owner
    return true;
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    
    setRemoving(memberId);
    try {
      const response = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });

      if (response.ok) {
        // Refresh the page to show updated member list
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to remove member");
      }
    } catch (error) {
      alert("Failed to remove member");
    } finally {
      setRemoving(null);
    }
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      owner: "bg-yellow-100 text-yellow-800",
      admin: "bg-blue-100 text-blue-800",
      member: "bg-gray-100 text-gray-800"
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${colors[role as keyof typeof colors] || colors.member}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="border rounded p-4">
      <h2 className="font-semibold mb-2">Members ({members.length} seats)</h2>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div className="flex items-center gap-2">
              <div className="text-sm">
                {member.profiles?.full_name || member.profiles?.email || member.user_id}
              </div>
              {getRoleBadge(member.role)}
              <span className="text-xs text-gray-500">
                Joined {new Date(member.created_at).toLocaleDateString()}
              </span>
            </div>
            {canRemove(member.role, member.user_id) && (
              <button
                onClick={() => handleRemove(member.user_id)}
                disabled={removing === member.user_id}
                className="text-sm px-3 py-1 border rounded hover:bg-red-50 disabled:opacity-50"
              >
                {removing === member.user_id ? "Removing..." : "Remove"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
} 