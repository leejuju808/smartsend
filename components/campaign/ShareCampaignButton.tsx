"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ShareCampaignButton({ campaignId, orgs, actorId }: {
  campaignId: string;
  orgs: { id: string; name: string }[];
  actorId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [orgId, setOrgId] = React.useState<string>("");

  const share = async () => {
    const res = await fetch("/api/campaigns/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, orgId, actorId })
    });
    if (res.ok) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Share with Team</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Share Campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>Select an Organization</div>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger><SelectValue placeholder="Pick an org" /></SelectTrigger>
            <SelectContent>
              {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex justify-end"><Button onClick={share} disabled={!orgId}>Move to Org</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


