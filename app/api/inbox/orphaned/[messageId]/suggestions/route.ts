import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Block 19700 — Get Suggestions for Orphaned Message
 * Returns suggested contacts and campaigns based on email similarity, time proximity, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { messageId } = params;

    // Get the orphaned message
    const { data: message, error: messageError } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("id", messageId)
      .eq("is_orphaned", true)
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        { error: "Message not found or not orphaned" },
        { status: 404 }
      );
    }

    const fromEmail = message.from_email?.toLowerCase().trim() || "";
    const toEmail = message.to_email?.toLowerCase().trim() || "";
    const receivedAt = message.received_at;

    // Find suggested contacts by email similarity
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, email, first_name, last_name")
      .ilike("email", `%${fromEmail.split("@")[0]}%`)
      .limit(10);

    // Calculate similarity scores for contacts
    const suggestedContacts = (contacts || []).map((contact) => {
      const contactEmail = contact.email?.toLowerCase() || "";
      let similarity = 0;

      // Exact match
      if (contactEmail === fromEmail) {
        similarity = 1.0;
      }
      // Domain match
      else if (contactEmail.split("@")[1] === fromEmail.split("@")[1]) {
        similarity = 0.7;
      }
      // Name similarity (if we have names)
      else if (contact.first_name || contact.last_name) {
        const name = `${contact.first_name || ""} ${contact.last_name || ""}`.toLowerCase();
        if (name.includes(fromEmail.split("@")[0]) || fromEmail.includes(name.split(" ")[0])) {
          similarity = 0.5;
        }
      }

      return {
        ...contact,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || null,
        similarity_score: similarity,
      };
    }).filter((c) => c.similarity_score > 0)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 5);

    // Find suggested campaigns by to_email matching
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name, from_email")
      .ilike("from_email", `%${toEmail}%`)
      .limit(10);

    // Calculate similarity scores for campaigns
    const suggestedCampaigns = (campaigns || []).map((campaign) => {
      const campaignEmail = campaign.from_email?.toLowerCase() || "";
      let similarity = 0;

      // Exact match
      if (campaignEmail === toEmail) {
        similarity = 1.0;
      }
      // Domain match
      else if (campaignEmail.split("@")[0] === toEmail.split("@")[0]) {
        similarity = 0.8;
      }
      // Partial match
      else if (campaignEmail.includes(toEmail.split("@")[0]) || toEmail.includes(campaignEmail.split("@")[0])) {
        similarity = 0.6;
      }

      return {
        ...campaign,
        similarity_score: similarity,
      };
    }).filter((c) => c.similarity_score > 0)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 5);

    return NextResponse.json({
      contacts: suggestedContacts,
      campaigns: suggestedCampaigns,
    });
  } catch (error: any) {
    console.error("Error in GET /api/inbox/orphaned/[messageId]/suggestions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































