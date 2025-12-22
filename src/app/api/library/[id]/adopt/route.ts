import { NextRequest, NextResponse } from "next/server";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";
import type { LibraryKind } from "@/lib/library/constants";
import { computeLibraryReceipt, ReceiptComputationError } from "@/lib/library/receipts";
import { supabaseService } from "@/lib/supabase";
import { adoptResourceSchema, resourceParamSchema } from "@/lib/library/schemas";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const payload = parseOrThrow(adoptResourceSchema, await req.json());
    const { supabase } = await requireUser();
    const serviceSupabase = supabaseService();

    const { data: resource, error: resourceError } = await supabase
      .from("shared_resources")
      .select("kind, current_version")
      .eq("id", id)
      .single();

    if (resourceError || !resource) {
      throw new HttpError(404, "resource_not_found", { resourceId: id });
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

    const { data, error } = await supabase.rpc("shared_adopt", {
      p_resource: id,
      p_campaign: payload.campaignId,
      p_mode: payload.mode,
    });

    if (error) {
      throw new HttpError(400, "adoption_failed", { hint: error.message });
    }

    return NextResponse.json({ adoptionId: data, receipt });
  } catch (error) {
    return handleError(error);
  }
}
