import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { uploadId } = await req.json();
    
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId required" }, { status: 400 });
    }

    // Fetch upload + campaign
    const { data: up, error: fetchError } = await supabase
      .from("lead_uploads")
      .select("campaign_id, status")
      .eq("id", uploadId)
      .single();

    if (fetchError || !up) {
      return NextResponse.json({ error: "Upload not found" }, { status: 400 });
    }

    if (up.status !== "ready") {
      return NextResponse.json({ error: "not_ready" }, { status: 400 });
    }

    // Pull rows in pages and upsert to leads using service role
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let page = 0;
    let pageSize = 1000;
    let inserted = 0;
    let skipped = 0;

    while (true) {
      const { data: rows, error: rowsError } = await supabase
        .from("lead_upload_rows")
        .select("normalized, valid")
        .eq("upload_id", uploadId)
        .eq("valid", true)
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (rowsError || !rows || rows.length === 0) break;

      const batch = rows.map((r) => {
        const n = r.normalized as any;
        const payload: any = {
          campaign_id: up.campaign_id,
          email: n.email,
          email_domain: n.email_domain || null,
          source: "import",
        };

        // Only include non-empty fields
        if (n.first_name) payload.first_name = n.first_name;
        if (n.last_name) payload.last_name = n.last_name;
        if (n.name) payload.name = n.name;
        if (n.company) payload.company = n.company;
        if (n.title) payload.title = n.title;
        if (n.website) payload.website = n.website;

        return payload;
      });

      if (batch.length) {
        const { error: insertError } = await serviceSupabase
          .from("leads")
          .upsert(batch);

        if (insertError) {
          console.error("Batch insert error:", insertError);
          return NextResponse.json(
            { error: insertError.message },
            { status: 400 }
          );
        }
        inserted += batch.length;
      } else {
        skipped += rows.length;
      }

      if (rows.length < pageSize) break;
      page++;
    }

    await supabase
      .from("lead_uploads")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", uploadId);

    return NextResponse.json({ inserted, skipped });
  } catch (error: any) {
    console.error("Error in import/commit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

