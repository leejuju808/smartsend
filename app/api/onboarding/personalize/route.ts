// Block 21675 — AI Personalize API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's profile for city/company info
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, city")
    .eq("id", user.id)
    .maybeSingle();

  // For v1, return a simple preview
  // In production, this would call an AI service to personalize the template
  const preview = {
    subject: "Quick question about your roof",
    body: `Hi there,

We're helping homeowners in your area with roof inspections and repairs.

Would you like us to take a quick look at your roof? We can usually spot issues before they become bigger problems.

Let me know if you'd like to schedule a free inspection.

Best regards,
${profile?.company_name || "SmartSend"}`,
  };

  return NextResponse.json({ preview });
}














































