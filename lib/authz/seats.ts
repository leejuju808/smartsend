// lib/authz/seats.ts
// Seat checking for billing enforcement

import { createClient } from "@/lib/supabase/server";

export interface SeatCheckResult {
  ok: boolean;
  seats_used?: number;
  seats_allowed?: number;
  reason?: string;
}

/**
 * Check if team has available seats before adding a member
 * Returns seat check result with billing information
 */
export async function checkSeatAvailability(teamId: string): Promise<SeatCheckResult> {
  const sb = createClient();

  try {
    // Try to find billing subscription by team_id
    // Adjust table/column names based on your billing schema
    const { data: billing } = await sb
      .from("billing_subscriptions")
      .select("seats_allowed, seats_in_use, status")
      .eq("team_id", teamId)
      .maybeSingle();

    // If no billing record exists, allow (unlimited or not enforced)
    if (!billing) {
      return { ok: true };
    }

    // Check if subscription is active
    const badStatuses = ["canceled", "unpaid", "incomplete", "past_due"];
    if (badStatuses.includes(billing.status || "")) {
      return {
        ok: false,
        reason: "billing_inactive",
        seats_used: billing.seats_in_use,
        seats_allowed: billing.seats_allowed
      };
    }

    // Check seat limits
    const seatsUsed = billing.seats_in_use || 0;
    const seatsAllowed = billing.seats_allowed || 1;

    if (seatsUsed >= seatsAllowed) {
      return {
        ok: false,
        reason: "seats_exceeded",
        seats_used: seatsUsed,
        seats_allowed: seatsAllowed
      };
    }

    return {
      ok: true,
      seats_used: seatsUsed,
      seats_allowed: seatsAllowed
    };
  } catch (error) {
    console.error("Seat check error:", error);
    // Fail open - allow if check fails
    return { ok: true };
  }
}

/**
 * Alternative: Check seats using account_seats table (if that's your schema)
 */
export async function checkSeatAvailabilityByAccount(accountId: string): Promise<SeatCheckResult> {
  const sb = createClient();

  try {
    const { data: seats } = await sb
      .from("account_seats")
      .select("seats_purchased, seats_in_use")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!seats) {
      return { ok: true }; // No billing = unlimited
    }

    const seatsUsed = seats.seats_in_use || 0;
    const seatsPurchased = seats.seats_purchased || 1;

    if (seatsUsed >= seatsPurchased) {
      return {
        ok: false,
        reason: "seats_exceeded",
        seats_used: seatsUsed,
        seats_allowed: seatsPurchased
      };
    }

    return {
      ok: true,
      seats_used: seatsUsed,
      seats_allowed: seatsPurchased
    };
  } catch (error) {
    console.error("Seat check error:", error);
    return { ok: true };
  }
}















