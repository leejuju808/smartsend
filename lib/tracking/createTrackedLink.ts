"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

/**
 * Create a tracked link for click tracking
 * 
 * @param campaignId - The campaign ID
 * @param leadId - The lead ID
 * @param url - The original URL to track
 * @returns The tracking URL that redirects to the original URL
 */
export async function createTrackedLink(
  campaignId: string,
  leadId: string,
  url: string
): Promise<{ trackingUrl: string; error?: string }> {
  try {
    const supabase = createServiceClient();
    const token = randomUUID();

    const { data, error } = await supabase
      .from("smartsend_links")
      .insert({
        campaign_id: campaignId,
        lead_id: leadId,
        url,
        type: "click",
        token
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create tracked link:", error);
      return { trackingUrl: url, error: error.message }; // Fallback to original URL
    }

    const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.smartsendhq.com"}/api/t/c/${token}`;
    return { trackingUrl };
  } catch (error) {
    console.error("Error creating tracked link:", error);
    return { 
      trackingUrl: url, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Batch create tracked links for multiple URLs
 * Useful when processing email templates with multiple links
 */
export async function createTrackedLinks(
  campaignId: string,
  leadId: string,
  urls: string[]
): Promise<{ [originalUrl: string]: string }> {
  const results: { [originalUrl: string]: string } = {};
  
  for (const url of urls) {
    const { trackingUrl } = await createTrackedLink(campaignId, leadId, url);
    results[url] = trackingUrl;
  }
  
  return results;
}

