import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// POST: Share campaign with a user by email
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { email, role } = await req.json();

    if (!email || !role) {
      return NextResponse.json(
        { error: "email and role are required" },
        { status: 400 }
      );
    }

    if (!["viewer", "editor"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'viewer' or 'editor'" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const { data: shareData, error } = await supabase.rpc("share_campaign_with_email", {
      p_campaign: params.id,
      p_email: email,
      p_role: role,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log audit event
    await supabase.rpc("log_audit", {
      p_actor: user.id,
      p_campaign: params.id,
      p_entity_type: "share",
      p_entity: shareData?.id || shareData?.user_id || null,
      p_action: "share_add",
      p_meta: { role, email, user_id: shareData?.user_id || null }
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error sharing campaign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Unshare campaign with a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get share info before deletion for audit log
    const { data: shareInfo } = await supabase
      .from("campaign_shares")
      .select("id, role")
      .eq("campaign_id", params.id)
      .eq("user_id", user_id)
      .single();

    const { error } = await supabase.rpc("unshare_campaign_with_user", {
      p_campaign: params.id,
      p_user: user_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log audit event
    await supabase.rpc("log_audit", {
      p_actor: user.id,
      p_campaign: params.id,
      p_entity_type: "share",
      p_entity: shareInfo?.id || user_id,
      p_action: "share_remove",
      p_meta: { role: shareInfo?.role || null, user_id }
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error unsharing campaign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: List all shares for this campaign (with emails via RPC)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use RPC to get shares with emails (SECURITY DEFINER handles permissions)
    const { data, error } = await supabase.rpc("list_campaign_shares", {
      p_campaign: params.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ shares: data ?? [] });
  } catch (error: any) {
    console.error("Error fetching campaign shares:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
