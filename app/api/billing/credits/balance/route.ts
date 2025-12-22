import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("workspace_credits")
      .select("credits")
      .eq("workspace_id", workspaceId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" - that's ok, return 0
      console.error("Error fetching credits:", error);
      return NextResponse.json(
        { error: "Failed to fetch credits" },
        { status: 500 }
      );
    }

    return NextResponse.json({ credits: data?.credits ?? 0 });
  } catch (e: any) {
    console.error("Credit balance route error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Internal Error" },
      { status: 500 }
    );
  }
}








