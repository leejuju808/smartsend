import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import { redirect } from "next/navigation";
import TeamInviteForm from "./TeamInviteForm";
import TeamMembersList from "./TeamMembersList";
import TeamInvitesList from "./TeamInvitesList";
import DomainClaimCard from "@/components/DomainClaimCard";

export default async function TeamPage() {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) redirect("/login");
  
  if (status !== "pro") {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Team</h1>
        <p className="text-gray-600">Upgrade to Pro to create a team and add seats.</p>
      </div>
    );
  }

  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  const teamId = prof?.team_id;

  if (!teamId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Team</h1>
        <p className="text-gray-600">You need to be part of a team. Contact your team owner for an invitation.</p>
      </div>
    );
  }

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("name, owner_id")
    .eq("id", teamId)
    .maybeSingle();

  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("user_id, role, created_at, profiles:profiles(id,email,full_name)")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  const { data: invites } = await supabaseAdmin
    .from("team_invitations")
    .select("email, created_at, accepted, expires_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  const isOwner = team?.owner_id === userId;
  const myRole = members?.find(m => m.user_id === userId)?.role;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team: {team?.name}</h1>
        <div className="text-sm text-gray-500">
          {members?.length || 1} seat{members?.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Domain Claim Card - Owner/Admin only */}
      {(isOwner || myRole === 'admin') && (
        <DomainClaimCard />
      )}

      {/* Invite Form */}
      {(isOwner || myRole === 'admin') && (
        <TeamInviteForm teamId={teamId} />
      )}

      {/* Members */}
      <TeamMembersList 
        members={members || []} 
        isOwner={isOwner} 
        myRole={myRole}
        teamId={teamId}
      />

      {/* Invites */}
      <TeamInvitesList invites={invites || []} />
    </div>
  );
} 