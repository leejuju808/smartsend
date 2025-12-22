"use client";
import { useEffect, useState } from "react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<{id:string;name:string}[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const r = await fetch("/api/orgs/list"); 
    const j = await r.json();
    setOrgs(j.rows||[]); 
    setOrgId(j.current || j.rows?.[0]?.id || null);
  })(); }, []);

  useEffect(() => { if (orgId) localStorage.setItem("orgId", orgId); }, [orgId]);

  return (
    <Select value={orgId ?? undefined} onValueChange={v => setOrgId(v)}>
      <SelectTrigger className="w-56">
        {orgId ? null : <SelectValue placeholder="Select team" />}
        <SelectContent>
          {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </SelectTrigger>
    </Select>
  );
}

