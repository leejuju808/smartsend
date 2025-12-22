import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
};

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: members, error } = await supabase
    .from("campaign_members")
    .select("user_id, role, created_at")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows = (members ?? []) as MemberRow[];

  const items = rows.map((member) => ({
    id: member.user_id,
    name: member.user_id,
    avatar_url: null as string | null,
    role: member.role,
  }));

  return Response.json({ items });
}





