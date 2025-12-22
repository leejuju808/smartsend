/**
 * BLOCK 100000 — Usage Warning API
 * 
 * Returns usage warning status for the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUsageWarning } from "@/lib/billing/block100000-enforcement";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ warning: null }, { status: 200 });
    }

    // Get usage warning
    const warning = await getUsageWarning(user.id);

    return NextResponse.json({ warning }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching usage warning:", error);
    return NextResponse.json({ warning: null }, { status: 200 });
  }
}


























