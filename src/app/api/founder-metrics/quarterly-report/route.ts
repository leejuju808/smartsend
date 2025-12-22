import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = 'nodejs';

export async function POST() {
  try {
    // Check authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    // Restrict to founder/admin access
    if (profile?.email !== "julian@smartsendhq.com") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Invoke the Supabase Edge function to generate the report
    const { data, error } = await supabaseAdmin.functions.invoke('generate-quarterly-report', {
      body: {}
    });

    if (error) {
      console.error("Error invoking quarterly report function:", error);
      return NextResponse.json(
        { error: "Failed to generate report" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="quarterly-report-${new Date().toISOString().split('T')[0]}.json"`
      }
    });
  } catch (error) {
    console.error("Error generating quarterly report:", error);
    return NextResponse.json(
      { error: "Failed to generate quarterly report" },
      { status: 500 }
    );
  }
}

