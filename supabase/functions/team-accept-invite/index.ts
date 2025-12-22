import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { token, user_id } = await req.json();

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  // Find the invite by token
  const { data: invite, error: inviteError } = await supabase
    .from("org_invites")
    .select("*")
    .eq("token", token)
    .eq("accepted", false)
    .single();

  if (inviteError || !invite) {
    return new Response("Invalid or expired invite", { status: 400 });
  }

  // If user_id not provided, return error (user must be authenticated)
  if (!user_id) {
    return new Response("User ID required. User must be authenticated first.", { status: 401 });
  }

  // Create the membership
  const { error: membershipError } = await supabase.from("org_memberships").insert({
    org_id: invite.org_id,
    user_id,
    role: invite.role,
    invited_by: invite.invited_by,
    accepted_at: new Date().toISOString()
  });

  if (membershipError) {
    console.error("Error creating membership:", membershipError);
    return new Response(membershipError.message, { status: 500 });
  }

  // Mark the invite as accepted
  const { error: updateError } = await supabase
    .from("org_invites")
    .update({ accepted: true })
    .eq("id", invite.id);

  if (updateError) {
    console.error("Error updating invite:", updateError);
    // Membership was created, so don't fail here
  }

  return new Response(
    JSON.stringify({ ok: true, org_id: invite.org_id }),
    { headers: { "Content-Type": "application/json" } }
  );
});

