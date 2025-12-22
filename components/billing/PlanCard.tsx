"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function PlanCard({ plan, caps }: { plan: string; caps: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold capitalize">{plan}</div>

        <div className="mt-4 space-y-2 text-sm">
          <div>Daily Send Cap: {caps.daily_send_cap}</div>
          <div>Daily Reply Cap: {caps.daily_reply_cap}</div>
          <div>Seat Limit: {caps.seat_limit}</div>
        </div>
      </CardContent>
    </Card>
  );
}








