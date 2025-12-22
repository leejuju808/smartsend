// Block 220000 — Get Contract by Proposal ID
// GET /api/contracts/by-proposal/[id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: contract, error } = await supabase
      .from("estimates_contracts")
      .select("*")
      .eq("proposal_id", id)
      .single();

    if (error) {
      // Contract doesn't exist yet, that's fine
      return NextResponse.json({
        ok: true,
        contract: null,
      });
    }

    return NextResponse.json({
      ok: true,
      contract,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























