import { supabaseAdmin } from "@/server/supabase";
import { salesforceFetch } from "@/lib/salesforce";

/**
 * Log an AI reply as a Task in Salesforce
 * Call this after successfully sending an email
 */
export async function logSalesforceTask(
  userId: string, 
  to: string, 
  subject: string, 
  text: string
) {
  try {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("team_id")
      .eq("id", userId)
      .maybeSingle();
      
    if (!prof?.team_id || !to) return;

    // Find the contact in Salesforce by email
    const soql = encodeURIComponent(`SELECT Id FROM Contact WHERE Email='${to.replace(/'/g,"\\'")}' LIMIT 1`);
    const contactRes = await salesforceFetch(prof.team_id, `/services/data/v59.0/query?q=${soql}`);
    const jq = await contactRes.json();
    const contactId = jq?.records?.[0]?.Id;

    if (contactId) {
      // Create Task
      await salesforceFetch(prof.team_id, `/services/data/v59.0/sobjects/Task`, {
        method: "POST",
        body: JSON.stringify({
          Subject: `AI reply sent via SmartSendAI: ${subject}`.slice(0, 255),
          WhoId: contactId,
          Status: "Completed",
          Priority: "Normal",
          Description: `Preview:\n${text}\n\nView: ${process.env.NEXT_PUBLIC_SITE_URL}/threads`
        }),
      });
    }
  } catch (error) {
    console.error("Failed to log Salesforce Task:", error);
    // Don't fail the main operation if Salesforce logging fails
  }
}

/**
 * Create an Event in Salesforce when proposing meeting times
 * Call this when generating .ics files or proposing meeting slots
 */
export async function logSalesforceEvent(
  userId: string,
  to: string,
  subject: string,
  startTime: Date,
  endTime: Date,
  description?: string
) {
  try {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("team_id")
      .eq("id", userId)
      .maybeSingle();
      
    if (!prof?.team_id || !to) return;

    // Find the contact in Salesforce by email
    const soql = encodeURIComponent(`SELECT Id FROM Contact WHERE Email='${to.replace(/'/g,"\\'")}' LIMIT 1`);
    const contactRes = await salesforceFetch(prof.team_id, `/services/data/v59.0/query?q=${soql}`);
    const jq = await contactRes.json();
    const contactId = jq?.records?.[0]?.Id;

    if (contactId) {
      // Create Event
      await salesforceFetch(prof.team_id, `/services/data/v59.0/sobjects/Event`, {
        method: "POST",
        body: JSON.stringify({
          Subject: subject || "Intro call – SmartSendAI",
          WhoId: contactId,
          StartDateTime: startTime.toISOString(),
          EndDateTime: endTime.toISOString(),
          Description: description || "Proposed times sent via SmartSendAI."
        }),
      });
    }
  } catch (error) {
    console.error("Failed to log Salesforce Event:", error);
    // Don't fail the main operation if Salesforce logging fails
  }
} 