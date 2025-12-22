"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function SeatUsageCard({
  seatsUsed,
  seatLimit,
}: {
  seatsUsed: number;
  seatLimit: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seat Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold">
          {seatsUsed} / {seatLimit}
        </div>
      </CardContent>
    </Card>
  );
}








