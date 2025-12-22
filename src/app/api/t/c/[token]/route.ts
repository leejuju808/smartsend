import { NextRequest, NextResponse } from "next/server";
import { recordTrackingEvent, incrementStepMetrics } from "@/lib/tracking";
import { supabaseAdmin } from "@/server/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;
    if (!token) {
      return new NextResponse("Missing token", { status: 400 });
    }

    // Get client IP and user agent
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     request.headers.get("x-real-ip") ||
                     "unknown";
    
    const userAgent = request.headers.get("user-agent") || "unknown";
    const referrer = request.headers.get("referer") || undefined;

    // Get the original URL from the token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('tracking_tokens')
      .select('url, campaign_id, recipient_id, step_index, variant_id')
      .eq('token', token)
      .eq('type', 'click')
      .single();

    if (tokenError || !tokenData || !tokenData.url) {
      console.error("Invalid click tracking token:", tokenError);
      return new NextResponse("Invalid tracking link", { status: 400 });
    }

    // Record the click event
    const success = await recordTrackingEvent(token, "click", ipAddress, userAgent, referrer);
    
    // If tracking was successful, increment step metrics and variant metrics
    if (success && tokenData.step_index) {
      try {
        // Increment step metrics
        await incrementStepMetrics(tokenData.campaign_id, tokenData.step_index, 'click');
        
        // EXPERIMENTS: Increment variant metrics if variant_id exists
        if (tokenData.variant_id) {
          // Get current clicks count and increment
          const { data: currentMetrics } = await supabaseAdmin
            .from('variant_metrics')
            .select('clicks')
            .eq('variant_id', tokenData.variant_id)
            .single();
          
          if (currentMetrics) {
            await supabaseAdmin
              .from('variant_metrics')
              .update({ 
                clicks: (currentMetrics.clicks || 0) + 1,
                updated_at: new Date().toISOString()
              })
              .eq('variant_id', tokenData.variant_id);
          }
        }
        
        // Log to activity_log
        const lead_id = tokenData.recipient_id;
        if (tokenData.campaign_id && lead_id) {
          try {
            // Get account_id and company_id
            const { data: campaign } = await supabaseAdmin
              .from('campaigns')
              .select('account_id, workspace_id, org_id')
              .eq('id', tokenData.campaign_id)
              .maybeSingle();
            
            const account_id = campaign?.account_id || campaign?.workspace_id || campaign?.org_id;
            
            if (account_id) {
              const { data: lead } = await supabaseAdmin
                .from('leads')
                .select('company_id')
                .eq('id', lead_id)
                .maybeSingle();
              
              await supabaseAdmin.from('activity_log').insert({
                account_id,
                campaign_id: tokenData.campaign_id,
                company_id: lead?.company_id || null,
                lead_id,
                event_type: 'email_click',
                meta: { url: tokenData.url, ip: ipAddress, user_agent: userAgent },
              });
            }
          } catch (activityErr) {
            console.error('Failed to log click activity:', activityErr);
          }
        }
      } catch (error) {
        console.error('Error incrementing metrics:', error);
      }
    }

    // Redirect to the original URL
    return NextResponse.redirect(tokenData.url);
  } catch (error) {
    console.error("Error in click tracking:", error);
    
    // If tracking fails, still try to redirect if we can get the URL
    try {
      const { data: tokenData } = await supabaseAdmin
        .from('tracking_tokens')
        .select('url')
        .eq('token', params.token)
        .eq('type', 'click')
        .single();

      if (tokenData?.url) {
        return NextResponse.redirect(tokenData.url);
      }
    } catch (fallbackError) {
      console.error("Fallback redirect failed:", fallbackError);
    }

    return new NextResponse("Tracking error", { status: 500 });
  }
} 