"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Sender = {
  id: string; 
  type: "domain"|"address"; 
  display_name?: string|null;
  from_email: string; 
  provider_id?: string|null; 
  status: string;
  dns: Array<{ type: string; name: string; value: string; status?: string }>;
  is_default: boolean;
};

export default function SendersPage() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const r = await fetch("/api/senders/list"); 
    const j = await r.json();
    setSenders(j.senders || []);
  }
  
  useEffect(() => { refresh(); }, []);

  async function createDomain() {
    if (!domain.trim()) return;
    
    setLoading(true);
    try {
      const r = await fetch("/api/senders/create-domain", {
        method: "POST", 
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), displayName: displayName.trim() || null })
      });
      const j = await r.json();
      if (r.ok) { 
        setDomain(""); 
        setDisplayName(""); 
        await refresh(); 
      } else {
        alert(j.error || "Failed to create domain");
      }
    } catch (error) {
      alert("Failed to create domain");
    } finally {
      setLoading(false);
    }
  }

  async function setDefault(id: string) {
    const r = await fetch("/api/senders/set-default", {
      method: "POST", 
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (r.ok) refresh();
  }

  async function verify(id: string) {
    const r = await fetch(`/api/senders/refresh/${id}`, { method: "POST" });
    if (r.ok) refresh();
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sender Identities</h1>

      <div className="rounded-2xl border p-6 space-y-4">
        <div className="font-medium">Add a sending domain</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input 
            className="border rounded-lg p-3" 
            placeholder="yourdomain.com" 
            value={domain} 
            onChange={e=>setDomain(e.target.value)} 
          />
          <Input 
            className="border rounded-lg p-3" 
            placeholder="Display name (optional)" 
            value={displayName} 
            onChange={e=>setDisplayName(e.target.value)} 
          />
          <Button 
            onClick={createDomain} 
            disabled={loading || !domain.trim()}
            className="px-4 py-3 rounded-lg bg-black text-white hover:bg-gray-800"
          >
            {loading ? "Creating..." : "Create"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          We'll generate DKIM/SPF records. Add them in your DNS, then click Verify.
        </p>
      </div>

      <div className="grid gap-4">
        {senders.map(s => (
          <div key={s.id} className="rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-medium">{s.display_name || "Sender"}</div>
                <div className="text-sm text-muted-foreground">{s.from_email}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${
                  s.status === "verified" 
                    ? "bg-green-100 text-green-700" 
                    : "bg-yellow-100 text-yellow-700"
                }`}>
                  {s.status}
                </span>
                <Link href={`/settings/senders/${s.id}`}>
                  <Button 
                    variant="outline"
                    size="sm"
                  >
                    Warmup
                  </Button>
                </Link>
                {!s.is_default && (
                  <Button 
                    onClick={() => setDefault(s.id)} 
                    variant="outline"
                    size="sm"
                  >
                    Set default
                  </Button>
                )}
                {s.is_default && (
                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                    Default
                  </span>
                )}
              </div>
            </div>

            {s.dns?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-muted-foreground mb-2">Add these DNS records:</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Value</th>
                        <th className="text-left p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.dns.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.type}</td>
                          <td className="p-2">
                            <button 
                              className="underline hover:no-underline" 
                              onClick={()=>copyToClipboard(r.name)}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="p-2">
                            <button 
                              className="underline hover:no-underline" 
                              onClick={()=>copyToClipboard(r.value)}
                            >
                              {r.value}
                            </button>
                          </td>
                          <td className="p-2">{r.status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button 
                  onClick={() => verify(s.id)} 
                  variant="outline"
                  className="mt-3"
                >
                  Verify now
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {senders.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No sender identities yet. Add a domain above to get started.
        </div>
      )}
    </div>
  );
}