'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Share = { user_id: string; role: 'viewer'|'editor' };

export function ShareButton({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<'viewer'|'editor'>('viewer');
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    // Get current user ID
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setActorUserId(user.id);
    });
  }, [supabase]);

  async function loadShares() {
    if (!actorUserId) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-share`, {
      method: "POST",
      headers: { 
        "content-type":"application/json", 
        "x-actor": actorUserId,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ op: "list", campaign_id: campaignId })
    });
    const j = await res.json();
    setShares(j.shares ?? []);
  }

  useEffect(() => { 
    if (open && actorUserId) loadShares(); 
  }, [open, actorUserId]);

  async function addShare() {
    if (!actorUserId) return;
    setLoading(true);
    // TODO: resolve email -> user_id via your auth table (or invite flow)
    // For now, we'll assume user_id is provided directly or resolve via email
    const user_id = email.trim(); // temporary: treat as user_id if you already have it
    
    // Try to resolve email to user_id if it looks like an email
    if (email.includes('@')) {
      // You might want to add a lookup here
      // For now, we'll use the email as a placeholder
      alert("Please resolve email to user_id first. This is a placeholder.");
      setLoading(false);
      return;
    }
    
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-share`, {
      method: "POST",
      headers: { 
        "content-type":"application/json", 
        "x-actor": actorUserId,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ op: "add", campaign_id: campaignId, user_id, role })
    });
    setEmail("");
    setRole('viewer');
    await loadShares();
    setLoading(false);
  }

  async function updateRole(uid: string, r: 'viewer'|'editor') {
    if (!actorUserId) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-share`, {
      method: "POST",
      headers: { 
        "content-type":"application/json", 
        "x-actor": actorUserId,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ op: "update", campaign_id: campaignId, user_id: uid, role: r })
    });
    await loadShares();
  }

  async function removeShare(uid: string) {
    if (!actorUserId) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-share`, {
      method: "POST",
      headers: { 
        "content-type":"application/json", 
        "x-actor": actorUserId,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ op: "remove", campaign_id: campaignId, user_id: uid })
    });
    await loadShares();
  }

  if (!actorUserId) return null;

  return (
    <>
      <Button variant="outline" onClick={()=>setOpen(true)}>Share</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="user id or email…" value={email} onChange={e=>setEmail(e.target.value)} />
              <Select value={role} onValueChange={(v)=>setRole(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addShare} disabled={!email || loading}>{loading? "…" : "Add"}</Button>
            </div>

            <Card className="p-3">
              <div className="text-sm font-medium mb-2">People with access</div>
              <div className="space-y-2">
                {shares.map(s => (
                  <div key={s.user_id} className="flex items-center justify-between">
                    <div className="text-sm">{s.user_id}</div>
                    <div className="flex items-center gap-2">
                      <Select value={s.role} onValueChange={(v)=>updateRole(s.user_id, v as any)}>
                        <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="destructive" onClick={()=>removeShare(s.user_id)}>Remove</Button>
                    </div>
                  </div>
                ))}
                {shares.length===0 && <div className="text-sm text-muted-foreground">No collaborators yet.</div>}
              </div>
            </Card>
          </div>

          <DialogFooter>
            <Button onClick={()=>setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

