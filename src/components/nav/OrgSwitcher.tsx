"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/Button";

type OrgMember = {
  org_id: string;
  role: string;
  organizations?: {
    name: string;
  };
};

export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<OrgMember[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchOrgs() {
      try {
        const res = await fetch("/api/orgs/list");
        if (!res.ok) return;
        const data = await res.json();
        setOrgs(data.orgs || []);
        setCurrentOrgId(data.currentOrgId || null);
      } catch (error) {
        console.error("Failed to fetch orgs:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchOrgs();
  }, []);

  const handleSwitch = async (orgId: string) => {
    await fetch("/api/orgs/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    });
    setCurrentOrgId(orgId);
    window.location.reload();
  };

  const handleCreateOrg = async () => {
    const name = prompt("Workspace name?")?.trim();
    if (!name) return;
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) window.location.reload();
  };

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (orgs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentOrgId ?? ""}
        onValueChange={handleSwitch}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select workspace" />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((o) => (
            <SelectItem key={o.org_id} value={o.org_id}>
              {o.organizations?.name || o.org_id.slice(0, 8)}
              {o.role !== "admin" && ` • ${o.role}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleCreateOrg}>
        + New
      </Button>
    </div>
  );
}

