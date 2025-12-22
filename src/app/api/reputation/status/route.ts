import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sendingIdentity = searchParams.get("sending_identity");
    const accountId = searchParams.get("account_id");

    if (!sendingIdentity) {
      return NextResponse.json(
        { error: "sending_identity parameter required" },
        { status: 400 }
      );
    }

    // Get reputation status using Block 11800 function
    const { data: status, error: statusError } = await supabase.rpc(
      "get_reputation_status",
      {
        p_sending_identity: sendingIdentity,
        p_account_id: accountId || null,
      }
    );

    if (statusError) {
      console.error("Get reputation status error:", statusError);
      return NextResponse.json(
        { error: statusError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sending_identity: sendingIdentity,
      status,
    });
  } catch (error: any) {
    console.error("Get reputation status error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































