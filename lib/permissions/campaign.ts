import { createClient } from "@/lib/supabase/server";

export async function requireEditor(campaignId: string) {
  const supabase = createClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    return {
      allowed: false,
      response: Response.json(
        { error: "unauthorized", message: "You must be logged in to perform this action." },
        { status: 401 }
      ),
    };
  }

  const { data: role } = await supabase.rpc("get_campaign_role", {
    campaign_id_input: campaignId,
    user_id_input: user.id,
  });

  if (!role || role === "viewer") {
    return {
      allowed: false,
      response: Response.json(
        { error: "forbidden", message: "You do not have permission to edit this campaign." },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, role };
}








