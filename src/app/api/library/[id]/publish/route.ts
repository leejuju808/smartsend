import { NextRequest, NextResponse } from "next/server";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";
import { publishResourceSchema, resourceParamSchema } from "@/lib/library/schemas";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const payload = parseOrThrow(publishResourceSchema, await req.json());
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("shared_publish", {
      p_resource: id,
      p_content: payload.content,
      p_changelog: payload.changelog ?? null,
      p_status: payload.status ?? "published",
    });

    if (error) {
      throw new HttpError(400, "publish_failed", { hint: error.message });
    }

    try {
      const { data: adopters, error: adoptersError } = await supabase
        .from("shared_adoptions")
        .select("campaign_id")
        .eq("resource_id", id)
        .eq("mode", "inherit");

      if (adoptersError) {
        throw adoptersError;
      }

      const payloads =
        adopters
          ?.map((adopter) => adopter.campaign_id)
          .filter((campaignId): campaignId is string => Boolean(campaignId))
          .map((campaignId) => ({
            kind: "library_update",
            campaign_id: campaignId,
            meta: {
              resource_id: id,
              new_version: data,
            },
          })) ?? [];

      if (payloads.length > 0) {
        const { error: alertError } = await supabase.from("system_alerts").insert(payloads);
        if (alertError) {
          throw alertError;
        }
      }
    } catch (enqueueError) {
      console.error("[library.publish] failed to enqueue update alerts", enqueueError);
    }

    return NextResponse.json({ nextVersion: data });
  } catch (error) {
    return handleError(error);
  }
}

