import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "not_auth" }, { status: 401 });
  }

  // Fetch all saved views that the user can access:
  // 1. Personal views owned by the user
  // 2. Team views (scope = 'team')
  // 3. Account views (scope = 'account') - if user is in same account
  const { data: views, error } = await supabase
    .from("shared_resources")
    .select("*")
    .eq("kind", "saved_view")
    .or(`scope.eq.team,scope.eq.personal,owner_id.eq.${user.user.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error listing saved views:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter personal views to only show user's own
  const filteredViews = (views ?? []).filter(
    (view) => view.scope !== "personal" || view.owner_id === user.user?.id
  );

  return NextResponse.json({ views: filteredViews });
}












