import { NextRequest, NextResponse } from "next/server";
import { handleError, parseOrThrow, parseSearchParams, requireUser, HttpError } from "@/lib/api/auth";
import { resourceParamSchema, updateStatusQuerySchema } from "@/lib/library/schemas";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const { campaignId } = parseSearchParams(updateStatusQuerySchema, req);
    const { supabase } = await requireUser();

    const [{ data: resource, error: resourceError }, { data: adoption }] = await Promise.all([
      supabase.from("shared_resources").select("current_version").eq("id", id).single(),
      supabase
        .from("shared_adoptions")
        .select("resource_version, mode")
        .eq("resource_id", id)
        .eq("campaign_id", campaignId)
        .single(),
    ]);

    if (resourceError || !resource) {
      throw new HttpError(404, "resource_not_found", { resourceId: id });
    }

    if (!adoption) {
      throw new HttpError(404, "adoption_not_found", { campaignId });
    }

    const mode = adoption.mode as "clone" | "inherit";
    const currentVersion = resource.current_version ?? 0;
    const adoptedVersion = adoption.resource_version ?? 0;

    return NextResponse.json({
      mode,
      currentVersion,
      adoptedVersion,
      hasUpdate: mode === "clone" ? currentVersion > adoptedVersion : false,
    });
  } catch (error) {
    return handleError(error);
  }
}







