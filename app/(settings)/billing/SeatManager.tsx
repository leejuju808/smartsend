"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SeatResponse = {
  caps?: { max_seats?: number };
  seats?: {
    seats_in_use: number;
    seats_purchased: number;
    over_limit?: boolean;
    locked_at?: string | null;
  } | null;
  usage?: Array<{ metric: string; count: number }>;
  locks?: {
    sending_locked: boolean;
    invites_locked: boolean;
    reason: string | null;
    updated_at: string;
  } | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SeatManager({ accountId }: { accountId: string }) {
  const { data, error, mutate, isLoading } = useSWR<SeatResponse>(
    accountId ? `/api/billing/caps/${accountId}` : null,
    fetcher,
  );

  const seatsInUse = data?.seats?.seats_in_use ?? 0;
  const seatsPurchased = data?.seats?.seats_purchased ?? 1;
  const locks = data?.locks;

  const [target, setTarget] = useState<number>(seatsPurchased);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (typeof seatsPurchased === "number" && !Number.isNaN(seatsPurchased)) {
      setTarget(seatsPurchased);
    }
  }, [seatsPurchased]);

  const belowUsage = useMemo(() => target < seatsInUse, [target, seatsInUse]);

  const updateSeats = async () => {
    if (!accountId) return;
    if (!Number.isInteger(target) || target < 1) {
      toast.error("Seat count must be a positive integer.");
      return;
    }
    if (belowUsage) {
      toast.error(`Cannot set seats below current members (${seatsInUse}). Remove members first.`);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/billing/seats/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, seats: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Seat update failed");
      }
      toast.success("Seats updated. Stripe will prorate this change.");
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Seat update failed");
    } finally {
      setIsSaving(false);
    }
  };

  const openPortal = async () => {
    if (!accountId) return;
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, returnUrl: window.location.href }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
      } else if (json?.error) {
        throw new Error(json.error);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Unable to open billing portal");
    }
  };

  const seatCap = data?.caps?.max_seats;
  const overLimit = Boolean(data?.seats?.over_limit);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Seats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="text-sm text-red-500">Failed to load seat data.</div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Seats in use: <b>{isLoading ? "…" : seatsInUse}</b> • Purchased:{" "}
            <b>{isLoading ? "…" : seatsPurchased}</b>
            {typeof seatCap === "number" && (
              <>
                {" "}
                • Plan limit: <b>{seatCap}</b>
              </>
            )}
            {overLimit && <span className="ml-2 text-red-500">Over limit!</span>}
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            type="number"
            min={1}
            value={Number.isFinite(target) ? target : ""}
            onChange={(event) => {
              const value = parseInt(event.target.value, 10);
              setTarget(Number.isFinite(value) ? value : 1);
            }}
            className="w-full md:w-32"
            aria-label="Seats to purchase"
          />
          <Button
            onClick={updateSeats}
            disabled={isSaving || target === seatsPurchased || belowUsage}
          >
            {isSaving ? "Updating…" : "Update seats"}
          </Button>
          <Button variant="secondary" onClick={openPortal}>
            Open billing portal
          </Button>
        </div>

        {belowUsage && (
          <div className="text-xs text-red-500">
            Seat count cannot be below members in use. Remove team members first.
          </div>
        )}

        {locks?.invites_locked && (
          <div className="text-xs text-red-500">
            Invites locked: {locks.reason ?? "Over seat limit or payment issue"}
          </div>
        )}

        {locks?.sending_locked && (
          <div className="text-xs text-red-500">
            Sending is locked: {locks.reason ?? "Billing lock — resolve in Billing"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}



