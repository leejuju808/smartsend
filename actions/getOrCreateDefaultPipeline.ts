// actions/getOrCreateDefaultPipeline.ts
import { createClient } from "@/lib/supabase/server";

export async function getOrCreateDefaultPipeline(workspaceId: string) {
  const supabase = createClient();

  // Check if default pipeline exists
  const { data: existingPipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Default Pipeline")
    .maybeSingle();

  if (existingPipeline) {
    return existingPipeline.id;
  }

  // Create default pipeline using the database function
  const { data, error } = await supabase.rpc(
    "create_default_pipeline_for_workspace",
    {
      p_workspace_id: workspaceId,
    }
  );

  if (error) {
    console.error("Failed to create default pipeline:", error);
    throw error;
  }

  return data;
}



























































