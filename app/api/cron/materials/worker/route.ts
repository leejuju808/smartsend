// Block 18300 — Material Detection Engine v1
// Background worker to automatically detect materials from messages and photos
// GET /api/cron/materials/worker
// Runs periodically to process pending material detection jobs

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    
    // Check for cron secret if configured
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find contacts with messages that haven't been analyzed for materials
    // Look for recent inbound messages (last 7 days) without material intelligence
    const { data: contactsToAnalyze, error: contactsError } = await supabase
      .rpc('get_contacts_needing_material_analysis', {
        days_back: 7,
      })
      .limit(50); // Process up to 50 contacts per run

    // If RPC doesn't exist, use a query instead
    if (contactsError) {
      const { data: recentMessages, error: messagesError } = await supabase
        .from("normalized_messages")
        .select(`
          linked_thread_id,
          preview_clean,
          body_preview,
          html,
          contacts!inner(id, workspace_id)
        `)
        .eq("direction", "inbound")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(100);

      if (messagesError) {
        console.error("Error fetching messages:", messagesError);
        return NextResponse.json({ ok: true, processed: 0, error: "No messages to process" });
      }

      // Group by contact and analyze
      const contactMap = new Map<string, { contactId: string; workspaceId: string; texts: string[] }>();

      for (const msg of recentMessages || []) {
        const contactId = (msg.contacts as any)?.id;
        const workspaceId = (msg.contacts as any)?.workspace_id;
        
        if (!contactId) continue;

        if (!contactMap.has(contactId)) {
          contactMap.set(contactId, {
            contactId,
            workspaceId,
            texts: [],
          });
        }

        const text = msg.preview_clean || msg.body_preview || "";
        if (text.length > 50) {
          contactMap.get(contactId)!.texts.push(text);
        }
      }

      // Check which contacts already have material intelligence
      const contactIds = Array.from(contactMap.keys());
      const { data: existingIntel } = await supabase
        .from("material_intelligence")
        .select("contact_id")
        .in("contact_id", contactIds);

      const existingContactIds = new Set(
        (existingIntel || []).map((i) => i.contact_id)
      );

      // Process contacts without intelligence
      let processed = 0;
      for (const [contactId, data] of contactMap.entries()) {
        if (existingContactIds.has(contactId)) continue;

        const combinedText = data.texts.join(" ").slice(0, 2000); // Limit text length
        
        if (combinedText.length < 50) continue; // Skip if too short

        try {
          // Call material detection API
          const detectResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/materials/detect`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.INTERNAL_TOKEN || ""}`,
              },
              body: JSON.stringify({
                contactId,
                text: combinedText,
              }),
            }
          );

          if (detectResponse.ok) {
            processed++;
          }
        } catch (error) {
          console.error(`Error processing contact ${contactId}:`, error);
        }
      }

      return NextResponse.json({
        ok: true,
        processed,
        message: `Processed ${processed} contacts for material detection`,
      });
    }

    // If RPC exists, process those contacts
    let processed = 0;
    for (const contact of contactsToAnalyze || []) {
      try {
        // Get recent messages for this contact
        const { data: messages } = await supabase
          .from("normalized_messages")
          .select("preview_clean, body_preview")
          .eq("linked_thread_id", contact.thread_id || contact.id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(10);

        const combinedText = (messages || [])
          .map((m) => m.preview_clean || m.body_preview || "")
          .join(" ")
          .slice(0, 2000);

        if (combinedText.length < 50) continue;

        const detectResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/materials/detect`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.INTERNAL_TOKEN || ""}`,
            },
            body: JSON.stringify({
              contactId: contact.id,
              text: combinedText,
            }),
          }
        );

        if (detectResponse.ok) {
          processed++;
        }
      } catch (error) {
        console.error(`Error processing contact ${contact.id}:`, error);
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      message: `Processed ${processed} contacts for material detection`,
    });
  } catch (error: any) {
    console.error("Material detection worker error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}





















































