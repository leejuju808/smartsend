import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { campaignId, filename } = await req.json();
    
    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id required" }, { status: 400 });
    }

    // Create upload row
    const uploadId = crypto.randomUUID();
    const storagePath = `imports/${user.id}/${uploadId}.csv`;
    
    const { data: up, error } = await supabase
      .from("lead_uploads")
      .insert({
        id: uploadId,
        user_id: user.id,
        campaign_id: campaignId,
        storage_path: storagePath,
        status: "pending",
      })
      .select("id, storage_path")
      .single();

    if (error) {
      console.error("Error creating upload:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ 
      uploadId: up.id, 
      storagePath: up.storage_path 
    });
  } catch (error: any) {
    console.error("Error in import/start:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

