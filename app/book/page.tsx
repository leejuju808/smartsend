"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

export default function BookPage() {
  const search = useSearchParams();
  const hold = search.get("hold");
  const [status, setStatus] = React.useState<"idle" | "ok" | "error">("idle");

  const confirm = React.useCallback(async () => {
    if (!hold) return;
    const name = (document.getElementById("name") as HTMLInputElement | null)?.value ?? "";
    const email = (document.getElementById("email") as HTMLInputElement | null)?.value ?? "";
    const response = await fetch("/api/cal/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hold_id: hold,
        attendee_name: name || undefined,
        attendee_email: email || undefined,
      }),
    });
    setStatus(response.ok ? "ok" : "error");
  }, [hold]);

  if (!hold) {
    return (
      <div className="mx-auto max-w-md p-8 text-sm text-muted-foreground">
        Missing hold identifier. Please use the booking link shared in your email.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-xl font-semibold">Confirm your time</h1>
      <input id="name" placeholder="Your name" className="w-full rounded-lg border p-2" />
      <input
        id="email"
        placeholder="you@company.com"
        type="email"
        className="w-full rounded-lg border p-2"
      />
      <button className="rounded-xl border px-4 py-2" onClick={confirm}>
        Confirm
      </button>
      {status === "ok" && (
        <p className="text-sm text-green-700">Booked! A calendar invite is on the way.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-700">Sorry - we could not confirm this hold.</p>
      )}
    </div>
  );
}

