/**
 * Block 13800 — Lead Score Engine API
 * Bulk recalculate lead scores
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { recalculateContactLeadScore } from "@/lib/lead-scoring/contact-lead-score";

/**
 * POST /api/contacts/lead-score/recalculate
 * Recalculate lead scores for multiple contacts or all contacts in a workspace
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { workspace_id, contact_ids, reason = "bulk_recalculation" } = body;

    if (!workspace_id && !contact_ids) {
      return NextResponse.json(
        { error: "Either workspace_id or contact_ids required" },
        { status: 400 }
      );
    }

    let contactIds: string[] = [];

    if (contact_ids && Array.isArray(contact_ids)) {
      contactIds = contact_ids;
    } else if (workspace_id) {
      // Get all contacts in workspace
      const { data: contacts, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspace_id);

      if (error) {
        throw new Error(`Failed to get contacts: ${error.message}`);
      }

      contactIds = contacts.map((c) => c.id);
    }

    if (contactIds.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: "No contacts to process",
      });
    }

    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    const results = [];
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batch = contactIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (contactId) => {
        try {
          await recalculateContactLeadScore(supabase, contactId, reason);
          return { contact_id: contactId, success: true };
        } catch (error: any) {
          console.error(`Error recalculating score for ${contactId}:`, error);
          return {
            contact_id: contactId,
            success: false,
            error: error.message,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      processed += batchResults.filter((r) => r.success).length;
      errors += batchResults.filter((r) => !r.success).length;
    }

    return NextResponse.json({
      ok: true,
      processed,
      errors,
      total: contactIds.length,
      results: results.slice(0, 100), // Return first 100 results
    });
  } catch (error: any) {
    console.error("Error in bulk recalculation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to recalculate lead scores" },
      { status: 500 }
    );
  }
}





















































