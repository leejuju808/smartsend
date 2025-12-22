"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Acc = { id: string; provider: "gmail"|"outlook"; email_address: string };

export default function SendTestButton({ campaignId, defaultTo }: { campaignId: string; defaultTo?: string }) {
  const [open, setOpen] = React.useState(false);
  const [accounts, setAccounts] = React.useState<Acc[]>([]);
  const [account, setAccount] = React.useState<string>("");
  const [toEmail, setToEmail] = React.useState(defaultTo ?? "");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const res = await fetch("/api/provider-accounts/list");
      if (res.ok) {
        const j = await res.json();
        setAccounts(j);
        if (j[0]?.id) setAccount(j[0].id);
      }
    })();
  }, []);

  const send = async () => {
    if (!account || !toEmail) return toast.error("Choose an account and enter your email.");
    setLoading(true);
    const res = await fetch("/api/campaigns/send-test", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ campaignId, providerAccountId: account, toEmail })
    });
    setLoading(false);
    if (!res.ok) return toast.error(await res.text());
    toast.success("Test email sent!");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary">Send Test to Myself</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Send Test</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>From account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.provider} — {a.email_address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Send to</Label>
            <Input type="email" placeholder="you@company.com" value={toEmail} onChange={(e)=>setToEmail(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={send} disabled={loading}>{loading ? "Sending..." : "Send Test"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
