"use client";
import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle"|"loading"|"done"|"error">("idle");

  async function submit() {
    setStatus("loading");
    const r = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (r.ok) setStatus("done"); else setStatus("error");
  }

  if (status === "done") {
    return <p className="text-green-600 mt-4">✅ Thanks — we'll be in touch soon!</p>;
  }

  return (
    <div className="mt-12 max-w-sm mx-auto">
      <div className="flex gap-2 mb-2">
        <input
          type="email"
          placeholder="email@company.com"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          onClick={submit}
          disabled={status==="loading" || !email}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        >
          {status==="loading" ? "..." : "Join Waitlist"}
        </button>
      </div>
      <p className="text-xs text-gray-500 text-center">
        By joining, you agree to receive product tips. Unsubscribe anytime.
      </p>
    </div>
  );
} 