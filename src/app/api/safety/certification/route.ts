import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/safety/certification - Create or update a certification
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const {
      user_id,
      type,
      issued_date,
      expiration_date,
      file_url,
    } = await req.json();

    if (!user_id || !type || !issued_date || !expiration_date) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, type, issued_date, expiration_date" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("certifications")
      .insert({
        user_id,
        workspace_id: workspaceId,
        type,
        issued_date,
        expiration_date,
        file_url: file_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating certification:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("Error in POST /api/safety/certification:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/safety/certification - Get certifications
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    const expiringSoon = searchParams.get("expiring_soon"); // days ahead

    let query = supabase
      .from("certifications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("expiration_date", { ascending: true });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (expiringSoon) {
      const daysAhead = parseInt(expiringSoon, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      query = query
        .gte("expiration_date", new Date().toISOString().split("T")[0])
        .lte("expiration_date", futureDate.toISOString().split("T")[0]);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching certifications:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Calculate days until expiration for each certification
    const certificationsWithDays = (data || []).map((cert) => {
      const expirationDate = new Date(cert.expiration_date);
      const today = new Date();
      const daysUntilExpiration = Math.ceil(
        (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        ...cert,
        days_until_expiration: daysUntilExpiration,
        is_expired: daysUntilExpiration < 0,
        is_expiring_soon: daysUntilExpiration >= 0 && daysUntilExpiration <= 30,
      };
    });

    return NextResponse.json({ ok: true, data: certificationsWithDays });
  } catch (error: any) {
    console.error("Error in GET /api/safety/certification:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























