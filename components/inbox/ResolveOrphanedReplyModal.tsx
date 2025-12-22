"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface OrphanedMessage {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_clean: string | null;
  received_at: string;
  campaign_id: string | null;
  contact_id: string | null;
  thread_id: string | null;
}

interface SuggestedContact {
  id: string;
  email: string;
  name: string | null;
  similarity_score: number;
}

interface SuggestedCampaign {
  id: string;
  name: string;
  from_email: string;
  similarity_score: number;
}

interface ResolveOrphanedReplyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: () => void;
}

/**
 * Block 19700 — Resolve Orphaned Reply Modal
 * Allows owner to assign orphaned replies to contacts and campaigns
 */
export function ResolveOrphanedReplyModal({
  open,
  onOpenChange,
  onResolved,
}: ResolveOrphanedReplyModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [orphanedMessages, setOrphanedMessages] = React.useState<OrphanedMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = React.useState<OrphanedMessage | null>(null);
  const [suggestedContacts, setSuggestedContacts] = React.useState<SuggestedContact[]>([]);
  const [suggestedCampaigns, setSuggestedCampaigns] = React.useState<SuggestedCampaign[]>([]);
  const [selectedContactId, setSelectedContactId] = React.useState<string>("");
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = React.useState<string>("");
  const { toast } = useToast();

  // Load orphaned messages when modal opens
  React.useEffect(() => {
    if (open) {
      loadOrphanedMessages();
    }
  }, [open]);

  // Load suggestions when message is selected
  React.useEffect(() => {
    if (selectedMessage) {
      loadSuggestions(selectedMessage);
    }
  }, [selectedMessage]);

  async function loadOrphanedMessages() {
    try {
      const res = await fetch("/api/inbox/orphaned");
      if (!res.ok) throw new Error("Failed to load orphaned messages");
      const data = await res.json();
      setOrphanedMessages(data.messages || []);
      if (data.messages && data.messages.length > 0) {
        setSelectedMessage(data.messages[0]);
      }
    } catch (error) {
      console.error("Error loading orphaned messages:", error);
      toast({
        description: "Failed to load orphaned messages",
        variant: "destructive",
      });
    }
  }

  async function loadSuggestions(message: OrphanedMessage) {
    try {
      const res = await fetch(`/api/inbox/orphaned/${message.id}/suggestions`);
      if (!res.ok) throw new Error("Failed to load suggestions");
      const data = await res.json();
      setSuggestedContacts(data.contacts || []);
      setSuggestedCampaigns(data.campaigns || []);
      
      // Auto-select first suggestion if available
      if (data.contacts && data.contacts.length > 0) {
        setSelectedContactId(data.contacts[0].id);
      }
      if (data.campaigns && data.campaigns.length > 0) {
        setSelectedCampaignId(data.campaigns[0].id);
      }
    } catch (error) {
      console.error("Error loading suggestions:", error);
    }
  }

  async function handleResolve() {
    if (!selectedMessage || !selectedContactId || !selectedCampaignId) {
      toast({
        description: "Please select both a contact and campaign",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/orphaned/${selectedMessage.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: selectedContactId,
          campaign_id: selectedCampaignId,
          thread_id: selectedThreadId || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to resolve orphaned reply");
      }

      toast({
        description: "Orphaned reply resolved successfully",
      });

      // Remove resolved message from list
      setOrphanedMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
      
      // Select next message or close if none left
      const remaining = orphanedMessages.filter((m) => m.id !== selectedMessage.id);
      if (remaining.length > 0) {
        setSelectedMessage(remaining[0]);
        setSelectedContactId("");
        setSelectedCampaignId("");
        setSelectedThreadId("");
      } else {
        onOpenChange(false);
        onResolved?.();
      }
    } catch (error: any) {
      toast({
        description: error.message || "Failed to resolve orphaned reply",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolve Orphaned Reply</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message selector */}
          {orphanedMessages.length > 1 && (
            <div className="space-y-2">
              <Label>Select message to resolve</Label>
              <Select
                value={selectedMessage?.id || ""}
                onValueChange={(value) => {
                  const msg = orphanedMessages.find((m) => m.id === value);
                  setSelectedMessage(msg || null);
                  setSelectedContactId("");
                  setSelectedCampaignId("");
                  setSelectedThreadId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a message" />
                </SelectTrigger>
                <SelectContent>
                  {orphanedMessages.map((msg) => (
                    <SelectItem key={msg.id} value={msg.id}>
                      {msg.from_email} - {msg.subject || "(no subject)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedMessage && (
            <>
              {/* Message preview */}
              <div className="border rounded-lg p-4 space-y-2 bg-muted/50">
                <div className="text-sm">
                  <strong>From:</strong> {selectedMessage.from_email}
                </div>
                <div className="text-sm">
                  <strong>To:</strong> {selectedMessage.to_email}
                </div>
                {selectedMessage.subject && (
                  <div className="text-sm">
                    <strong>Subject:</strong> {selectedMessage.subject}
                  </div>
                )}
                <div className="text-sm mt-2 max-h-32 overflow-y-auto">
                  <strong>Message:</strong>
                  <div className="mt-1 whitespace-pre-wrap">
                    {selectedMessage.body_clean || "(no body)"}
                  </div>
                </div>
              </div>

              {/* Suggested contacts */}
              {suggestedContacts.length > 0 && (
                <div className="space-y-2">
                  <Label>Contact (suggested matches)</Label>
                  <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {suggestedContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name || contact.email} ({Math.round(contact.similarity_score * 100)}% match)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Manual contact input */}
              {suggestedContacts.length === 0 && (
                <div className="space-y-2">
                  <Label>Contact ID</Label>
                  <Input
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                    placeholder="Enter contact ID or email"
                  />
                </div>
              )}

              {/* Suggested campaigns */}
              {suggestedCampaigns.length > 0 && (
                <div className="space-y-2">
                  <Label>Campaign (suggested matches)</Label>
                  <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      {suggestedCampaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.name} ({Math.round(campaign.similarity_score * 100)}% match)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Manual campaign input */}
              {suggestedCampaigns.length === 0 && (
                <div className="space-y-2">
                  <Label>Campaign ID</Label>
                  <Input
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    placeholder="Enter campaign ID"
                  />
                </div>
              )}

              {/* Optional thread */}
              <div className="space-y-2">
                <Label>Thread ID (optional)</Label>
                <Input
                  value={selectedThreadId}
                  onChange={(e) => setSelectedThreadId(e.target.value)}
                  placeholder="Leave empty to create new thread"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleResolve} disabled={loading || !selectedContactId || !selectedCampaignId}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

