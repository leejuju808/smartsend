// Block 220000 — Get Public Contract by Token
// GET /api/contracts/public/[token]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createClient();

    const { data: contract, error } = await supabase
      .from("estimates_contracts")
      .select("*")
      .eq("public_token", token)
      .single();

    if (error || !contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
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

























