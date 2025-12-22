/**
 * Block 79000 — A/B Testing Engine
 * Auto-select winner cron job
 * Runs periodically to automatically select winning variants
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient();

    // Get all campaigns with A/B testing enabled that don't have a winner yet
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .in("status", ["running", "active", "sending"])
      .not("id", "in", 
        supabase
          .from("ab_winners")
          .select("campaign_id")
      );

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        processed: 0,
        message: "No campaigns to process" 
      });
    }

    let winnersSelected = 0;
    let errors = 0;

    // Process each campaign
    for (const campaign of campaigns) {
      try {
        // Check if campaign has variants with sufficient data
        const { data: variants, error: variantsError } = await supabase
          .from("ab_variants")
          .select("id")
          .eq("campaign_id", campaign.id);

        if (variantsError || !variants || variants.length < 2) {
          continue; // Need at least 2 variants
        }

        // Check if winner already exists
        const { data: existingWinner } = await supabase
          .from("ab_winners")
          .select("id")
          .eq("campaign_id", campaign.id)
          .single();

        if (existingWinner) {
          continue; // Already has winner
        }

        // Check if variants have minimum sends (10 per variant)
        const { data: metrics } = await supabase
          .from("ab_metrics")
          .select("variant_id, sends")
          .in("variant_id", variants.map(v => v.id));

        const hasEnoughData = metrics?.some(m => m.sends >= 10);
        if (!hasEnoughData) {
          continue; // Need more data
        }

        // Auto-select winner
        const { data: winnerId, error: selectError } = await supabase.rpc("select_ab_winner", {
          p_campaign_id: campaign.id,
        });

        if (selectError) {
          console.error(`Error selecting winner for campaign ${campaign.id}:`, selectError);
          errors++;
          continue;
        }

        if (winnerId) {
          winnersSelected++;
          console.log(`Winner selected for campaign ${campaign.id}: variant ${winnerId}`);
        }
      } catch (error: any) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: campaigns.length,
      winnersSelected,
      errors,
    });
  } catch (error: any) {
    console.error("Error in A/B winner selector:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























