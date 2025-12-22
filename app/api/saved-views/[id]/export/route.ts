import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import {
  createServiceSupabase,
  resolveViewMembershipRole,
  type ServiceSupabaseClient,
  type ViewMembershipRole,
} from "../_shared";

const CSV_HEADERS = [
  "id",
  "full_name",
  "email",
  "company_name",
  "company_domain",
  "company_size",
  "company_industry",
  "company_tech",
  "title",
  "timezone",
  "phone",
  "last_contacted_at",
  "updated_at",
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceSupabase();

  const { data: view, error: viewError } = await service
    .from("saved_views")
    .select("id, account_id, name, filter, owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (viewError || !view) {
    return NextResponse.json({ ok: false, error: "view_not_found" }, { status: 404 });
  }

  const membershipRole = await resolveViewMembershipRole(
    service,
    params.id,
    user.id,
    view.owner_id
  );
  if (!membershipRole) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: leadRows, error: leadError } = await service.rpc("rpc_view_lead_ids", {
    p_view_id: params.id,
  });

  if (leadError) {
    await logExportEvent(service, params.id, "error", 0, leadError.message);
    return NextResponse.json({ ok: false, error: "lead_resolve_failed" }, { status: 400 });
  }

  const leadIds = (leadRows ?? []).map((row: any) => row.lead_id).filter(Boolean);

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let chunkError: unknown = null;
      controller.enqueue(encoder.encode(CSV_HEADERS.join(",") + "\n"));

      if (leadIds.length === 0) {
        controller.close();
      } else {
        try {
          const chunkSize = 1000;
          for (let i = 0; i < leadIds.length; i += chunkSize) {
            const batch = leadIds.slice(i, i + chunkSize);
            const { data: rows, error } = await service
              .from("v_leads_for_views")
              .select(
                "id,full_name,email,company_name,company_domain,company_size,company_industry,company_tech,title,timezone,phone,last_contacted_at,updated_at"
              )
              .in("id", batch)
              .eq("account_id", view.account_id);

            if (error) {
              throw error;
            }

            for (const row of rows ?? []) {
              const line = [
                row.id,
                safe(row.full_name),
                safe(row.email),
                safe(row.company_name),
                safe(row.company_domain),
                row.company_size ?? "",
                safe(row.company_industry),
                JSON.stringify(row.company_tech ?? []),
                safe(row.title),
                safe(row.timezone),
                safe(row.phone),
                row.last_contacted_at ?? "",
                row.updated_at ?? "",
              ]
                .map(csvEscape)
                .join(",")
                .concat("\n");

              controller.enqueue(encoder.encode(line));
            }
          }

          controller.close();
        } catch (err: any) {
          chunkError = err;
          controller.error(err);
        }
      }
      const latencyMs = Date.now() - startedAt;
      await logExportEvent(
        service,
        params.id,
        chunkError ? "error" : "ok",
        leadIds.length,
        chunkError instanceof Error ? chunkError.message : undefined,
        latencyMs
      );
    },
  });

  return new Response(stream, {
    headers: downloadHeaders(view.name),
  });
}

async function logExportEvent(
  service: ServiceSupabaseClient,
  viewId: string,
  status: "ok" | "error",
  count: number,
  message?: string,
  latencyMs?: number
) {
  try {
    await service.rpc("log_event", {
      p_kind: "saved_view_export",
      p_status: status,
      p_latency_ms: latencyMs ?? null,
      p_count_int: count,
      p_ref_id: viewId,
      p_message: message ?? null,
      p_context: {},
    });
  } catch (err) {
    console.error("Failed to log saved_view_export event", err);
  }
}

function downloadHeaders(viewName: string) {
  const filename = `saved-view-${slug(viewName)}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  };
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function safe(value: unknown): string {
  return value == null ? "" : String(value);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


