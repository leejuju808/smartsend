import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;

    // Get campaign sharing status
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("campaigns")
      .select("is_shared, workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get campaign owners if not shared
    let owners: any[] = [];
    if (!campaign.is_shared) {
      const { data: campaignOwners } = await supabaseAdmin
        .from("campaign_owners")
        .select("user_id")
        .eq("campaign_id", campaignId);

      if (campaignOwners) {
        // Get user details
        const userIds = campaignOwners.map(co => co.user_id);
        const { data: profiles } = await supabaseAdmin.auth.admin.listUsers();
        owners = userIds.map(userId => {
          const profile = profiles?.users.find(u => u.id === userId);
          return {
            user_id: userId,
            email: profile?.email || null,
            name: profile?.user_metadata?.name || null,
          };
        });
      }
    }

    return NextResponse.json({
      is_shared: campaign.is_shared,
      owners,
    });
  } catch (error: any) {
    console.error("Error fetching campaign sharing:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const { is_shared, owner_ids } = await req.json();

    // Get current user for permission check
    const cookieStore = await cookies();
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (k) => cookieStore.get(k)?.value,
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get campaign workspace
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Check permission: user must be owner/admin
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      // Fallback to workspace_members
      const { data: wm } = await supabaseAdmin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", campaign.workspace_id)
        .eq("user_id", user.id)
        .single();
      
      if (!wm || (wm.role !== 'owner' && wm.role !== 'admin')) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
    }

    // Update campaign sharing status
    const { error: updateError } = await supabaseAdmin
      .from("campaigns")
      .update({ is_shared: is_shared !== false })
      .eq("id", campaignId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // If not shared, update owners
    if (is_shared === false && Array.isArray(owner_ids)) {
      // Delete existing owners
      await supabaseAdmin
        .from("campaign_owners")
        .delete()
        .eq("campaign_id", campaignId);

      // Insert new owners
      if (owner_ids.length > 0) {
        const ownersToInsert = owner_ids.map((userId: string) => ({
          campaign_id: campaignId,
          user_id: userId,
        }));

        await supabaseAdmin
          .from("campaign_owners")
          .insert(ownersToInsert);
      }
    } else if (is_shared !== false) {
      // If shared, remove all owners
      await supabaseAdmin
        .from("campaign_owners")
        .delete()
        .eq("campaign_id", campaignId);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating campaign sharing:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

