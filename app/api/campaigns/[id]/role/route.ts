import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = (await supabase.auth.getUser()).data.user;
  
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_campaign_role", {
    campaign_id_input: params.id,
    user_id_input: user.id,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json(
    { role: data || null },
    { status: 200 }
  );
}

