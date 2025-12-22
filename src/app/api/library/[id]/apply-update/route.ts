import { NextRequest, NextResponse } from "next/server";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";
import type { LibraryKind } from "@/lib/library/constants";
import { computeLibraryReceipt, ReceiptComputationError } from "@/lib/library/receipts";
import { applyUpdateSchema, resourceParamSchema } from "@/lib/library/schemas";
import { supabaseService } from "@/lib/supabase";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const payload = parseOrThrow(applyUpdateSchema, await req.json());
    const { supabase } = await requireUser();
    const serviceSupabase = supabaseService();

    const [{ data: resource, error: resourceError }, { data: adoption }] = await Promise.all([
      supabase.from("shared_resources").select("current_version, kind").eq("id", id).single(),
      supabase
        .from("shared_adoptions")
        .select("mode, resource_version")
        .eq("resource_id", id)
        .eq("campaign_id", payload.campaignId)
        .single(),
    ]);

    if (resourceError || !resource) {
      throw new HttpError(404, "resource_not_found", { resourceId: id });
    }

    if (!adoption) {
      throw new HttpError(404, "adoption_not_found", { campaignId: payload.campaignId });
    }

    if (adoption.mode !== "clone") {
      throw new HttpError(400, "unsupported_adoption_mode", { mode: adoption.mode });
    }

    const currentVersion = resource.current_version ?? null;

    let versionContent: unknown = null;

    if (currentVersion && currentVersion > 0) {
      const { data: version, error: versionError } = await supabase
        .from("shared_versions")
        .select("content")
        .eq("resource_id", id)
        .eq("version", currentVersion)
        .single();

      if (versionError || !version) {
        throw new HttpError(404, "resource_version_not_found", { resourceId: id, version: currentVersion });
      }
      versionContent = version.content;
    } else {
      const { data: version, error: versionError } = await supabase
        .from("shared_versions")
        .select("content, version")
        .eq("resource_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (versionError || !version) {
        throw new HttpError(404, "resource_version_not_found", { resourceId: id });
      }

      versionContent = version.content;
    }

    let receipt: Awaited<ReturnType<typeof computeLibraryReceipt>>;
    try {
      receipt = await computeLibraryReceipt({
        kind: resource.kind as LibraryKind,
        campaignId: payload.campaignId,
        content: versionContent,
        supabase: serviceSupabase,
      });
    } catch (error) {
      if (error instanceof ReceiptComputationError) {
        const hint =
          (error.cause &&
            typeof error.cause === "object" &&
            "message" in error.cause &&
            typeof (error.cause as { message?: unknown }).message === "string" &&
            (error.cause as { message: string }).message) ||
          error.message;
        throw new HttpError(400, "failed_to_compute_receipt", { hint });
      }
      throw error;
    }

    const { error: adoptError } = await supabase.rpc("shared_adopt", {
      p_resource: id,
      p_campaign: payload.campaignId,
      p_mode: adoption.mode,
    });

    if (adoptError) {
      throw new HttpError(400, "apply_update_failed", { hint: adoptError.message });
    }

    const { error: bumpError } = await supabase
      .from("shared_adoptions")
      .update({ resource_version: resource.current_version })
      .eq("resource_id", id)
      .eq("campaign_id", payload.campaignId);

    if (bumpError) {
      throw new HttpError(400, "failed_to_update_adoption_version", { hint: bumpError.message });
    }

    const { error: alertError } = await serviceSupabase
      .from("system_alerts")
      .delete()
      .eq("campaign_id", payload.campaignId)
      .eq("kind", "library_update");

    if (alertError) {
      throw new HttpError(400, "failed_to_clear_alerts", { hint: alertError.message });
    }

    return NextResponse.json({ ok: true, toVersion: resource.current_version, receipt });
  } catch (error) {
    return handleError(error);
  }
}



