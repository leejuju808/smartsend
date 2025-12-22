// POST /v1/sandbox/reset - Reset sandbox data

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  // Only allow sandbox/test keys
  if (auth.apiKey.environment !== "sandbox" && auth.apiKey.environment !== "test") {
    throw new ApiError("403_FORBIDDEN", "Sandbox reset only available for test/sandbox keys", 403);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all sandbox data for this API key
  const { data: sandboxData } = await supabase
    .from("api_sandbox_data")
    .select("entity_type, entity_id")
    .eq("api_key_id", auth.apiKey.id);

  if (sandboxData && sandboxData.length > 0) {
    // Delete sandbox entities by type
    const entitiesByType: Record<string, string[]> = {};
    sandboxData.forEach((item) => {
      if (!entitiesByType[item.entity_type]) {
        entitiesByType[item.entity_type] = [];
      }
      entitiesByType[item.entity_type].push(item.entity_id);
    });

    // Delete entities (only if they belong to workspace)
    for (const [entityType, entityIds] of Object.entries(entitiesByType)) {
      const tableName = entityType === "lead" ? "leads" :
                        entityType === "job" ? "roofing_jobs" :
                        entityType === "quote" ? "proposals" : null;

      if (tableName) {
        await supabase
          .from(tableName)
          .delete()
          .in("id", entityIds)
          .eq("workspace_id", auth.workspaceId);
      }
    }

    // Delete sandbox data records
    await supabase
      .from("api_sandbox_data")
      .delete()
      .eq("api_key_id", auth.apiKey.id);
  }

  return NextResponse.json({
    data: {
      message: "Sandbox data reset successfully",
      deleted_count: sandboxData?.length || 0,
    },
  });
});




































