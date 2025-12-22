import { NextRequest, NextResponse } from "next/server";
import { enforceLimits, checkFeature } from "@/lib/enforce";

/**
 * Block 417: Enforcement Check API
 * Allows frontend to check limits before actions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspace_id, metric, feature } = body as {
      workspace_id: string;
      metric?: "leads_count" | "daily_sends" | "seats";
      feature?: "warmup" | "experiments" | "analytics" | "domains";
    };

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    if (metric) {
      const result = await enforceLimits(workspace_id, metric);
      return NextResponse.json(result);
    }

    if (feature) {
      const result = await checkFeature(workspace_id, feature);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Either metric or feature must be provided" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Enforcement check error:", error);
    return NextResponse.json(
      { error: error.message || "Enforcement check failed" },
      { status: 500 }
    );
  }
}



