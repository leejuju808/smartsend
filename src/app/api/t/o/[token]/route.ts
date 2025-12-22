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

    // Record the open event
    const success = await recordTrackingEvent(token, "open", ipAddress, userAgent, referrer);
    
    // If tracking was successful, increment step metrics and variant metrics
    if (success) {
      try {
        // Get token details to extract campaign_id, step_index, variant_id, and lead_id
        const { data: tokenData } = await supabaseAdmin
          .from('tracking_tokens')
          .select('campaign_id, step_index, variant_id, lead_id, recipient_id')
          .eq('token', token)
          .eq('type', 'open')
          .single();
        
        if (tokenData) {
          // Increment step metrics
          await incrementStepMetrics(tokenData.campaign_id, tokenData.step_index, 'open');
          
          // EXPERIMENTS: Increment variant metrics if variant_id exists
          if (tokenData.variant_id) {
            // Get current opens count and increment
            const { data: currentMetrics } = await supabaseAdmin
              .from('variant_metrics')
              .select('opens')
              .eq('variant_id', tokenData.variant_id)
              .single();
            
            if (currentMetrics) {
              await supabaseAdmin
                .from('variant_metrics')
                .update({ 
                  opens: (currentMetrics.opens || 0) + 1,
                  updated_at: new Date().toISOString()
                })
                .eq('variant_id', tokenData.variant_id);
            }
          }
          
          // Log to activity_log
          const lead_id = tokenData.lead_id || tokenData.recipient_id;
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
                  event_type: 'email_open',
                  meta: { ip: ipAddress, user_agent: userAgent },
                });
              }
            } catch (activityErr) {
              console.error('Failed to log open activity:', activityErr);
            }
          }
        }
      } catch (error) {
        console.error('Error incrementing metrics:', error);
      }
    }

    // Return a 1x1 transparent GIF pixel
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );

    return new NextResponse(pixel, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (error) {
    console.error("Error in open tracking:", error);
    
    // Still return the pixel even if tracking fails
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );

    return new NextResponse(pixel, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }
} 