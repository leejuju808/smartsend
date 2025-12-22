import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveOrg } from "@/lib/org";

export const dynamic = "force-dynamic";

// GET - List presets for current user and org
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();

    // Get user and org presets
    const { data: presets, error } = await supabase
      .from("mapping_presets")
      .select("*")
      .or(
        org
          ? `owner_scope.eq.user,owner_id.eq.${user.id},owner_scope.eq.org,owner_id.eq.${org.id}`
          : `owner_scope.eq.user,owner_id.eq.${user.id}`
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching presets:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ presets: presets || [] });
  } catch (error: any) {
    console.error("Error in GET /api/mapping-presets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Create new preset
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, mapping, ownerScope } = await req.json();
    
    if (!name || !mapping) {
      return NextResponse.json(
        { error: "name and mapping required" },
        { status: 400 }
      );
    }

    const scope = ownerScope || "user";
    const ownerId = scope === "org" 
      ? ((await getActiveOrg())?.id || user.id)
      : user.id;

    const { data: preset, error } = await supabase
      .from("mapping_presets")
      .insert({
        owner_scope: scope,
        owner_id: ownerId,
        name,
        mapping,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating preset:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ preset });
  } catch (error: any) {
    console.error("Error in POST /api/mapping-presets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a preset
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("mapping_presets")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting preset:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/mapping-presets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

