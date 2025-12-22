"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

type Rec = { 
  id: string
  type: "CNAME" | "TXT"
  host: string
  value: string
  verified: boolean
  required: boolean
}

type Domain = { 
  id: string
  hostname: string
  status: string
}

export default function DomainsPage() {
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get("ws")
  
  const [hostname, setHostname] = useState("");
  const [domain, setDomain] = useState<Domain | null>(null);
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const createDomain = async () => {
    if (!workspaceId) {
      alert("Workspace ID required")
      return
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/domains/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, hostname })
      });
      
      const j = await res.json();
      
      if (!res.ok) {
        alert(j.error || "Failed to create domain")
        return
      }
      
      await load(j.domain_id);
    } catch (err) {
      console.error('Error creating domain:', err)
      alert('Failed to create domain')
    } finally {
      setLoading(false);
    }
  };

  const load = async (id: string) => {
    try {
      const r = await fetch(`/api/domains/${id}/records`);
      const j = await r.json();
      setDomain(j.domain);
      setRecords(j.records);
    } catch (err) {
      console.error('Error loading domain:', err)
      alert('Failed to load domain details')
    }
  };

  const verify = async () => {
    if (!domain) return;
    
    setVerifying(true);
    try {
      await fetch(`/api/domains/${domain.id}/verify`, { method: "POST" })
      await load(domain.id);
    } catch (err) {
      console.error('Error verifying DNS:', err)
      alert('Failed to verify DNS records')
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    // Load domain if provided in URL
    const domainId = searchParams.get("domain_id");
    if (domainId) {
      load(domainId);
    }
  }, [searchParams]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Custom Domain & DKIM</h1>

      {!domain && (
        <Card>
          <CardHeader className="text-lg font-semibold">Connect a domain</CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm opacity-80">
              Enter a subdomain to use for tracking (e.g., <code>send.acme.com</code>).
            </p>
            <div className="flex gap-2 max-w-xl">
              <Input
                placeholder="send.acme.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
              />
              <Button onClick={createDomain} disabled={!hostname || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {domain && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="text-lg font-semibold">{domain.hostname}</div>
            <Badge variant={domain.status === "verified" ? "default" : "secondary"}>
              {domain.status}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm opacity-80 mb-3">
              Add these DNS records at your registrar, then click Verify.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3">Type</th>
                    <th className="text-left py-2 pr-3">Host</th>
                    <th className="text-left py-2 pr-3">Value</th>
                    <th className="text-left py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 pr-3">{r.type}</td>
                      <td className="py-2 pr-3">{r.host}</td>
                      <td className="py-2 pr-3">
                        <code className="break-all">{r.value}</code>
                      </td>
                      <td className="py-2 pr-3">
                        {r.verified ? (
                          <span className="inline-flex items-center text-green-600">
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-amber-600">
                            <XCircle className="h-4 w-4 mr-1" /> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Button onClick={verify} disabled={verifying}>
                {verifying && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Verify DNS
              </Button>
            </div>
            <div className="mt-4 text-xs opacity-70">
              Tip: TXT records may take up to 15–30 minutes to propagate.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 