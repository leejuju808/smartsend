import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Parser } from "json2csv";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "json";
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const userId = url.searchParams.get("userId");
    const sourceType = url.searchParams.get("sourceType");

    // Build the query
    let q = sb
      .from("report_events")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (start) {
      q = q.gte("created_at", start);
    }
    if (end) {
      q = q.lte("created_at", end);
    }
    if (userId) {
      q = q.eq("user_id", userId);
    }
    if (sourceType) {
      q = q.eq("source_type", sourceType);
    }

    const { data, error } = await q;
    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Handle CSV export
    if (format === "csv") {
      const parser = new Parser({
        fields: [
          "source_type",
          "campaign_title",
          "recipient_email",
          "type",
          "created_at",
          "campaign_status"
        ]
      });
      
      const csv = parser.parse(data || []);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="smartsend_report_${Date.now()}.csv"`
        }
      });
    }

    // Return JSON with summary stats
    const summary = {
      total_events: data?.length || 0,
      by_type: data?.reduce((acc: any, event: any) => {
        acc[event.type] = (acc[event.type] || 0) + 1;
        return acc;
      }, {}) || {},
      by_source: data?.reduce((acc: any, event: any) => {
        acc[event.source_type] = (acc[event.source_type] || 0) + 1;
        return acc;
      }, {}) || {},
      events: data || []
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Reports API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 