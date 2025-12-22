"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export default function EmailConnectCard() {
  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="text-lg font-semibold">Connect your mailbox</div>
      <div className="flex gap-2">
        <Button onClick={() => (location.href = "/api/oauth/gmail/start")}>
          Connect Gmail
        </Button>
        <Button
          variant="outline"
          onClick={() => (location.href = "/api/oauth/outlook/start")}
        >
          Connect Outlook
        </Button>
      </div>
      <p className="text-sm opacity-80">
        We use read-only scopes + webhook subscriptions; revoke anytime.
      </p>
    </div>
  );
}






