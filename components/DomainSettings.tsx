"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function DomainSettings() {
  const [domain, setDomain] = useState("");
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/dkim/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      setInfo(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4 space-y-2">
      <h3 className="text-lg font-semibold">🔐 Domain & DKIM Setup</h3>
      <Input placeholder="yourdomain.com" value={domain} onChange={e=>setDomain(e.target.value)} />
      <Button className="bg-yellow-500 text-black" onClick={generate} disabled={loading}>
        {loading ? "Generating..." : "Generate DKIM Record"}
      </Button>
      {info && (
        <div className="mt-3 space-y-1 text-sm">
          <p><b>Selector:</b> {info.selector}</p>
          <p><b>TXT Record:</b> {info.txtRecord}</p>
          <Textarea readOnly value={info.dkimValue} rows={3} />
          <p className="text-xs text-zinc-500">Add this TXT record to your DNS, then mark verified in dashboard.</p>
        </div>
      )}
    </div>
  );
}