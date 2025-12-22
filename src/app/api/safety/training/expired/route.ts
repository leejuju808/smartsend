// POST /api/safety/training/expired - Check and mark expired training assignments

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    // Call the database function to check expired assignments
    const { data: expired, error } = await supabase.rpc("check_expired_training_assignments");

    if (error) {
      console.error("Error checking expired training:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // For each expired assignment, create a new assignment (reassign)
    if (expired && expired.length > 0) {
      for (const assignment of expired) {
        // Get the module to create new assignment
        const { data: oldAssignment } = await supabase
          .from("safety_training_assignments")
          .select("module_id, employee_id")
          .eq("id", assignment.assignment_id)
          .single();

        if (oldAssignment) {
          // Get module expiration
          const { data: module } = await supabase
            .from("safety_training_modules")
            .select("expires_after_days")
            .eq("id", oldAssignment.module_id)
            .single();

          const expiresAfterDays = module?.expires_after_days || 365;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expiresAfterDays);

          // Create new assignment
          await supabase
            .from("safety_training_assignments")
            .insert({
              module_id: oldAssignment.module_id,
              employee_id: oldAssignment.employee_id,
              assigned_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
              status: "reassigned",
              assigned_by: user.id,
              notes: "Auto-reassigned after expiration",
            });
        }
      }
    }

    return NextResponse.json({ expired: expired || [], count: expired?.length || 0 });
  } catch (error: any) {
    console.error("Error in POST /api/safety/training/expired:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























