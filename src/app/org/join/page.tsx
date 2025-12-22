"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function JoinOrg() {
  const sp = useSearchParams();
  const t = sp.get("t") || "";
  const [msg, setMsg] = useState("Joining…");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/orgs/invites/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) });
      const data = await res.json();
      if (res.ok) {
        await fetch("/api/orgs/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id: data.org_id }) });
        location.href = "/dashboard";
      } else {
        setMsg(data.error || "Failed to join");
      }
    })();
  }, [t]);

  return <div className="p-6 text-white">{msg}</div>;
}