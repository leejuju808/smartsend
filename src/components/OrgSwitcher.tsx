"use client";
import { useEffect, useState } from "react";

type Org = { id: string; name: string; role: string };

export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { (async () => {
    const res = await fetch("/api/orgs"); const data = await res.json();
    setOrgs(data.orgs || []);
  })(); }, []);

  const switchTo = async (org_id: string) => {
    await fetch("/api/orgs/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id }) });
    location.reload();
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm">Switch org</button>
      {open && (
        <div className="absolute mt-2 z-20 w-64 border border-gray-800 rounded-xl bg-black p-2">
          {orgs.map(o => (
            <button key={o.id} onClick={() => switchTo(o.id)} className="w-full text-left px-3 py-2 rounded hover:bg-gray-900">
              <div className="font-semibold">{o.name}</div>
              <div className="text-xs text-gray-500 uppercase">{o.role}</div>
            </button>
          ))}
          {orgs.length === 0 && <div className="px-3 py-2 text-gray-500 text-sm">No organizations</div>}
        </div>
      )}
    </div>
  );
}