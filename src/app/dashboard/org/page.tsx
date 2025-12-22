"use client";
import { useEffect, useState } from "react";
import Rbac from "@/components/Rbac";

interface Member {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  seat_limit: number;
  created_at: string;
}

export default function OrgPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      // Get user's organization
      const orgResponse = await fetch("/api/orgs");
      const orgs = await orgResponse.json();
      
      if (orgs.length > 0) {
        const userOrg = orgs[0]; // Assuming user belongs to one org for now
        setOrg(userOrg);
        
        // Get members
        const membersResponse = await fetch(`/api/orgs/${userOrg.id}/members`);
        const membersData = await membersResponse.json();
        setMembers(membersData);
      }
    } catch (err) {
      setError("Failed to load organization data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const inviteMember = async () => {
    if (!email.trim() || !org) return;
    
    try {
      setLoading(true);
      setError("");
      
      const response = await fetch(`/api/orgs/${org.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to invite member");
      }

      setEmail("");
      setRole("member");
      await loadData(); // Refresh the data
    } catch (err: any) {
      setError(err.message || "Failed to invite member");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !org) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Organization</h1>
        <p className="text-gray-600">No organization found.</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      {/* Organization Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {org.name}
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>Seat Limit: {org.seat_limit}</span>
          <span>Members: {members.length}</span>
          <span>Created: {new Date(org.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Members Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Members</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {member.full_name || member.email}
                  </p>
                  <p className="text-sm text-gray-500">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  member.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                  member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                  member.role === 'member' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {member.role}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(member.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Invite Form */}
        <Rbac need="invite" fallback={<div className="border-t pt-6"><div className="text-gray-500">You don't have permission to invite members.</div></div>}>
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Invite New Member</h3>
            <div className="flex gap-3">
              <input
                type="email"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={loading}
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={inviteMember}
                disabled={loading || !email.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Inviting..." : "Invite"}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Available seats: {Math.max(0, (org.seat_limit || 1) - members.length)}
            </p>
          </div>
        </Rbac>
      </div>
    </main>
  );
} 