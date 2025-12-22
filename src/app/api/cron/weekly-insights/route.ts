import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active organizations
    const { data: orgs } = await sb
      .from("organizations")
      .select("id, name, owner_id")
      .eq("status", "active");

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ message: "No active organizations found" });
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const org of orgs) {
      try {
        // Get organization owner
        const { data: owner } = await sb
          .from("users")
          .select("email, first_name, last_name")
          .eq("id", org.owner_id)
          .single();

        if (!owner?.email) {
          console.log(`No owner email found for org ${org.id}`);
          continue;
        }

        // Generate insights for the organization
        const insights = await generateOrgInsights(org.id);
        
        // Send email
        await sendInsightsEmail(owner.email, owner.first_name || owner.last_name || "there", org.name, insights);
        
        processedCount++;
        console.log(`Sent insights to ${owner.email} for org ${org.name}`);
        
      } catch (error) {
        console.error(`Error processing org ${org.id}:`, error);
        errorCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedCount, 
      errors: errorCount,
      message: `Weekly insights sent to ${processedCount} organizations`
    });

  } catch (error) {
    console.error("Error in weekly insights cron:", error);
    return NextResponse.json({ 
      error: "Failed to process weekly insights",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

async function generateOrgInsights(orgId: string) {
  // Get data from last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  // Get all users in the organization
  const { data: orgUsers } = await sb
    .from("users")
    .select("id")
    .eq("organization_id", orgId);

  if (!orgUsers || orgUsers.length === 0) {
    return "No user activity found in your organization this week.";
  }

  const userIds = orgUsers.map(u => u.id);
  
  // Get email events for all users in the org
  const { data: emailEvents } = await sb
    .from("email_events")
    .select("*")
    .in("user_id", userIds)
    .gte("created_at", since);

  if (!emailEvents || emailEvents.length === 0) {
    return "No email activity found in your organization this week. Start sending campaigns to get insights!";
  }

  // Aggregate stats
  const counts: any = { 
    sent: 0, 
    delivered: 0, 
    opened: 0, 
    clicked: 0, 
    replied: 0,
    bounced: 0,
    unsubscribed: 0
  };
  
  for (const e of emailEvents) { 
    if (counts[e.event_type] !== undefined) counts[e.event_type]++; 
  }

  // Get previous week data for comparison
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: prevWeekEvents } = await sb
    .from("email_events")
    .select("*")
    .in("user_id", userIds)
    .gte("created_at", twoWeeksAgo)
    .lt("created_at", oneWeekAgo);

  const prevWeekCounts: any = { 
    sent: 0, 
    delivered: 0, 
    opened: 0, 
    clicked: 0, 
    replied: 0,
    bounced: 0,
    unsubscribed: 0
  };
  
  if (prevWeekEvents) {
    for (const e of prevWeekEvents) { 
      if (prevWeekCounts[e.event_type] !== undefined) prevWeekCounts[e.event_type]++; 
    }
  }

  // Calculate week-over-week changes
  const changes: any = {};
  for (const key in counts) {
    if (prevWeekCounts[key] > 0) {
      changes[key] = ((counts[key] - prevWeekCounts[key]) / prevWeekCounts[key] * 100).toFixed(1);
    }
  }

  const prompt = `
You are a sales analytics assistant for SmartSend. 

Create a concise weekly summary email for an organization owner. Include:

1. Key performance metrics for the last 7 days
2. Week-over-week changes (mention % changes when relevant)
3. One specific action item to improve performance
4. Keep it under 150 words and make it actionable

DATA:
Current week: ${JSON.stringify(counts)}
Previous week: ${JSON.stringify(prevWeekCounts)}
Changes: ${JSON.stringify(changes)}

Format as a friendly, professional email that an organization owner would want to read.
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful sales analytics assistant. Write concise, actionable weekly summaries." },
      { role: "user", content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.3
  });

  return completion.choices[0]?.message?.content || "Unable to generate insights at this time.";
}

async function sendInsightsEmail(email: string, name: string, orgName: string, insights: string) {
  // For now, we'll just log the email content
  // In production, you'd integrate with your email service (SendGrid, etc.)
  console.log(`\n=== WEEKLY INSIGHTS EMAIL ===`);
  console.log(`To: ${email}`);
  console.log(`Subject: Your SmartSend Weekly Insights - ${orgName}`);
  console.log(`\nHi ${name},\n`);
  console.log(insights);
  console.log(`\nBest regards,\nThe SmartSend Team\n`);
  console.log(`================================\n`);
  
  // TODO: Integrate with your email service
  // Example with SendGrid:
  // await sendgrid.send({
  //   to: email,
  //   from: 'insights@smartsend.ai',
  //   subject: `Your SmartSend Weekly Insights - ${orgName}`,
  //   html: generateEmailHTML(name, orgName, insights)
  // });
} 