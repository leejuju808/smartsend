"use client";
import { useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Loader2, Share2 } from "lucide-react";

interface CampaignShareDialogProps {
  campaignId: string;
  workspaceId: string;
}

export default function CampaignShareDialog({ campaignId, workspaceId }: CampaignShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer"|"editor">("viewer");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const onShare = async () => {
    setLoading(true);
    setMessage("");
    
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      
      const j = await res.json();
      
      if (!res.ok) {
        setMessage(`Error: ${j.error || "Failed to share campaign"}`);
        return;
      }
      
      setMessage("Campaign shared successfully!");
      setEmail("");
    } catch (error) {
      console.error("Error sharing campaign:", error);
      setMessage("Failed to share campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4 mr-2" />
          Share Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="teammate@company.com" 
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                <SelectItem value="editor">Editor (can edit)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={onShare} disabled={loading || !email}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Share Campaign
            </Button>
          </div>
          {message && (
            <div className={`text-sm ${message.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
              {message}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}