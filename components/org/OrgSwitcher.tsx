"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function OrgSwitcher() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/orgs");
        const j = await r.json();
        const orgsList = j.orgs || [];
        setOrgs(orgsList);
        const currentOrg = orgsList.find((o: any) => o.id === j.current_org_id) || orgsList?.[0] || null;
        setCurrent(currentOrg);
      } catch (error) {
        console.error("Failed to load orgs:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const switchTo = async (orgId: string) => {
    try {
      await fetch("/api/me/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      
      // Set cookie for client-side persistence
      document.cookie = `current_org_id=${orgId}; path=/; max-age=31536000`;
      
      location.reload();
    } catch (error) {
      console.error("Failed to switch org:", error);
    }
  };

  if (loading) {
    return <Button variant="outline" disabled>Loading...</Button>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">{current?.name || "Select org"}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-1">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => switchTo(o.id)}
              className={`w-full text-left px-3 py-2 rounded-lg hover:bg-muted ${
                current?.id === o.id ? "bg-muted" : ""
              }`}
            >
              {o.name}
            </button>
          ))}
          {orgs.length === 0 && (
            <div className="text-sm text-muted-foreground px-3 py-2">
              No organizations
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


