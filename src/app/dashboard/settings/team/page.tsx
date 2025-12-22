"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function TeamSettingsPage() {
  const supabase = createClientComponentClient();
  const [members, setMembers] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");

  useEffect(() => {
    loadTeamData();
  }, []);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      
      // Get user's org_id from organization_members
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      
      if (!membership?.org_id) return;
      
      setOrgId(membership.org_id);
      
      // Get org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", membership.org_id)
        .single();
      
      if (org) setOrgName(org.name);
      
      // Get members with user details
      const { data: membersData } = await supabase
        .from("organization_members")
        .select("user_id, role, created_at, profiles(full_name, email)")
        .eq("org_id", membership.org_id);
      
      setMembers(membersData || []);
    } catch (error) {
      console.error("Error loading team data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!orgId || !email) return;
    
    try {
      const response = await fetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, email }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setEmail("");
        alert("Invite sent! Link: " + result.url);
        loadTeamData(); // Refresh members
      } else {
        alert("Error: " + (result.error || "Failed to send invite"));
      }
    } catch (error) {
      console.error("Error sending invite:", error);
      alert("Failed to send invite");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading…</div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Team</h1>
        <p className="text-gray-600">No organization found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">{orgName || "Team"}</h1>
      
      {/* Invite Form */}
      <div className="mb-4 border rounded-2xl p-4">
        <h2 className="font-medium mb-3">Invite Member</h2>
        <div className="flex gap-2">
          <input
            className="border rounded-xl px-3 py-2 mr-2 flex-1"
            placeholder="Teammate email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            onClick={handleInvite}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl hover:bg-primary/90 disabled:opacity-50"
            disabled={!email.trim()}
          >
            Invite
          </button>
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-2">
        <h2 className="font-medium mb-2">Members ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-gray-500 text-sm">No members yet</p>
        ) : (
          members.map((m) => (
            <div key={m.user_id} className="p-3 border rounded-2xl flex justify-between items-center">
              <div>
                <span className="font-medium">
                  {m.profiles?.full_name || m.profiles?.email || m.user_id}
                </span>
                {m.profiles?.email && (
                  <span className="text-sm text-gray-600 ml-2">({m.profiles.email})</span>
                )}
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize">
                {m.role}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

