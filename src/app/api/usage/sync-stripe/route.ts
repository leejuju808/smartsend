import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

/**
 * POST /api/usage/sync-stripe
 * Cron job: Sync pending usage records to Stripe usage_record API
 * Should run every hour
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch pending usage records (not yet synced to Stripe)
    const { data: pendingRecords, error: fetchError } = await supabase
      .from("usage_records")
      .select(
        `
        *,
        metered_billing_items!inner(
          stripe_subscription_item_id,
          metric_name,
          workspace_id
        )
      `
      )
      .eq("synced_to_stripe", false)
      .order("created_at", { ascending: true })
      .limit(1000); // Process in batches

    if (fetchError) {
      console.error("Error fetching pending records:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch pending records" },
        { status: 500 }
      );
    }

    if (!pendingRecords || pendingRecords.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        message: "No pending records to sync",
      });
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Group by subscription item to batch usage records
    const groupedByItem = new Map<
      string,
      Array<typeof pendingRecords[0] & { totalQuantity: number }>
    >();

    for (const record of pendingRecords) {
      const itemId = (
        record.metered_billing_items as any
      ).stripe_subscription_item_id;
      if (!groupedByItem.has(itemId)) {
        groupedByItem.set(itemId, []);
      }
      groupedByItem.get(itemId)!.push({
        ...record,
        totalQuantity: record.quantity,
      });
    }

    // Sync each subscription item's usage
    for (const [subscriptionItemId, records] of groupedByItem.entries()) {
      try {
        // Sum quantities for this item
        const totalQuantity = records.reduce(
          (sum, r) => sum + r.totalQuantity,
          0
        );

        // Get timestamp (use earliest record's timestamp)
        const timestamp =
          records[0]?.timestamp ||
          Math.floor(new Date(records[0].created_at).getTime() / 1000);

        // Create usage record in Stripe
        const usageRecord = await stripe.subscriptionItems.createUsageRecord(
          subscriptionItemId,
          {
            quantity: totalQuantity,
            timestamp: timestamp,
            action: "increment",
          }
        );

        // Mark all records as synced
        const recordIds = records.map((r) => r.id);
        await supabase
          .from("usage_records")
          .update({
            synced_to_stripe: true,
            stripe_usage_record_id: usageRecord.id,
          })
          .in("id", recordIds);

        synced += records.length;
      } catch (stripeError: any) {
        failed += records.length;
        errors.push(
          `Item ${subscriptionItemId}: ${stripeError.message || stripeError}`
        );
        console.error(`Stripe sync error for item ${subscriptionItemId}:`, stripeError);
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      failed,
      errors: errors.slice(0, 10), // Limit error details
      total_processed: pendingRecords.length,
    });
  } catch (error: any) {
    console.error("Usage sync error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

