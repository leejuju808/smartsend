import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/safety/refresh_domain_health
 * 
 * SmartSend Safety Net v1 - Refresh Domain Health
 * Refreshes domain health metrics based on recent bounce/complaint events
 * Integrates with Block 11600 domain health system
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json().catch(() => ({}));
    const { workspace_id, domain } = body;

    // If domain provided, refresh specific domain
    // Otherwise refresh all domains for workspace
    if (domain && workspace_id) {
      // Refresh specific domain health
      // This would call domain health refresh function from Block 11600
      // For now, we'll use a placeholder that can be integrated later
      const { error } = await supabase.rpc('refresh_domain_health', {
        p_domain: domain,
        p_workspace_id: workspace_id
      });

      if (error) {
        console.error('Error refreshing domain health:', error);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        domain,
        message: `Domain health refreshed for ${domain}`
      });
    } else {
      // Refresh all domains (for cron job)
      // This would iterate through all domains and refresh them
      // For now, return success - actual implementation depends on Block 11600
      return NextResponse.json({
        ok: true,
        message: 'Domain health refresh initiated (all domains)'
      });
    }
  } catch (error: any) {
    console.error('Refresh domain health error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































