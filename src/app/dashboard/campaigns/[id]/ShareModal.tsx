"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function ShareModal({ campaignId, open, onClose }: { campaignId: string, open: boolean, onClose: () => void }) {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    setLoading(true);
    setError(null);
    
    const { data: user } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (!user) {
      setError("No user found with that email.");
      setLoading(false);
      return;
    }

    const { error: insertErr } = await supabase
      .from("campaign_shares")
      .insert([{ campaign_id: campaignId, user_id: user.id, role }]);

    if (insertErr) setError(insertErr.message);
    setLoading(false);
    if (!insertErr) {
      setEmail("");
      setError(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this campaign</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <Input 
            placeholder="user@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
          />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
            </SelectContent>
          </Select>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleShare} disabled={loading}>
              {loading ? "Sharing..." : "Share"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
