import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

const bodySchema = z.object({
  customer_name: z.string().min(1),
  address: z.string().min(1),
  roof_type: z.enum(["Asphalt", "Metal", "Tile", "Flat"]),
  size: z.string().min(1),
  scope: z.enum(["Repair", "Partial", "Full Replacement"]),
  estimate_text: z.string().min(20),
  total_price: z.number().nonnegative(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = bodySchema.parse(await req.json());

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    const sb = await getServerSupabase();
    const { data: membership } = await sb
      .from("roofing_company_members")
      .select("roofing_company_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const companyId = membership?.roofing_company_id ?? null;
    if (!companyId) {
      return NextResponse.json({ error: "Company not found" }, { status: 400 });
    }

    const payload: Record<string, any> = {
      company_id: companyId,
      workspace_id: workspaceId,
      customer_name: input.customer_name,
      address: input.address,
      roof_type: input.roof_type,
      size: input.size,
      scope: input.scope,
      estimate_text: input.estimate_text,
      total_price: input.total_price,
      status: "draft",
      notes: input.notes ?? null,
      thread_id: null,
    };

    const { data, error } = await supabase
      .from("estimates")
      .insert(payload)
      .select("id, company_id, customer_name, address, roof_type, size, scope, total_price, status, created_at")
      .single();

    if (error) {
      console.error("Create Estimate save error:", error);
      return NextResponse.json({ error: "Failed to save estimate" }, { status: 500 });
    }

    return NextResponse.json({ estimate: data, success: true });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
    }
    console.error("Create Estimate save error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}











