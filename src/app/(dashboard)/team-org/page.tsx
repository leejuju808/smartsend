"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import OrgSwitcher from "../_components/OrgSwitcher";

export default function TeamOrgPage() {
  const [members,setMembers] = useState<any[]>([]);
  const [email,setEmail] = useState("");
  const [orgId,setOrgId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org/active").then(r=>r.json()).then(j=>setOrgId(j.org_id));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetch("/api/team/members?org_id="+orgId).then(r=>r.json()).then(j=>setMembers(j.members||[]));
  }, [orgId]);

  const invite = async () => {
    await fetch("/api/org/invite", {
      method: "POST", 
      headers: {"Content-Type":"application/json"}, 
      body: JSON.stringify({ org_id: orgId, email })
    });
    setEmail("");
    alert("Invite sent!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Team</h1>
        <OrgSwitcher />
      </div>
      <div className="grid gap-3">
        <div className="flex gap-2">
          <Input 
            placeholder="teammate@company.com" 
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
          />
          <Button onClick={invite}>Invite</Button>
        </div>
        <div className="rounded-2xl p-4 shadow-sm border">
          <h2 className="font-medium mb-2">Members</h2>
          <ul className="space-y-1">
            {members.map(m => <li key={m.user_id} className="text-sm">{m.email || m.user_id} — {m.role}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

