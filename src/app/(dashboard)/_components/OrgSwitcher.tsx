"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [active, setActive] = useState<string | undefined>();

  useEffect(() => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    supabase.from("organizations").select("id,name").then(({ data }) => setOrgs(data || []));
    fetch("/api/org/active").then(r=>r.json()).then(j=>setActive(j.org_id));
  }, []);

  const change = async (id: string) => {
    await fetch("/api/org/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id: id })});
    setActive(id);
    location.reload();
  };

  return (
    <div className="w-[220px]">
      <select value={active} onChange={e => change(e.target.value)} className="w-full px-3 py-2 border rounded-md">
        {orgs.length === 0 && <option>Loading...</option>}
        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

