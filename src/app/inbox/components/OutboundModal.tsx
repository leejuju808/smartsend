"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Clock, Send, Users } from "lucide-react";
import { AIOutreachPacks } from "./AIOutreachPacks";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
// Toast will be handled via alert for now, or import from sonner if available
const toast = {
  success: (msg: string) => alert(`Success: ${msg}`),
  error: (msg: string) => alert(`Error: ${msg}`),
};

export type OutboundChannel = "email" | "sms" | "voicemail" | "multi_step";

export interface Contact {
  id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface OutboundModalProps {
  open: boolean;
  onClose: () => void;
  initialChannel?: OutboundChannel;
  initialContactIds?: string[];
}

export function OutboundModal({
  open,
  onClose,
  initialChannel,
  initialContactIds = [],
}: OutboundModalProps) {
  const [channel, setChannel] = useState<OutboundChannel>(initialChannel || "email");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    new Set(initialContactIds)
  );
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [sendNow, setSendNow] = useState(true);
  const [multistepSequence, setMultistepSequence] = useState<"sms_then_email" | "email_then_sms">("sms_then_email");
  const [searchQuery, setSearchQuery] = useState("");

  const supabase = createClientComponentClient();

  // Load contacts
  useEffect(() => {
    if (open) {
      loadContacts();
    }
  }, [open, searchQuery]);

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get workspace_id
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const workspaceId = membership?.workspace_id;

      if (!workspaceId) return;

      let query = supabase
        .from("contacts")
        .select("id, email, phone, first_name, last_name, company")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (searchQuery.trim()) {
        query = query.or(
          `email.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,company.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading contacts:", error);
        toast.error("Failed to load contacts");
      } else {
        setContacts(data || []);
      }
    } catch (error) {
      console.error("Error loading contacts:", error);
      toast.error("Failed to load contacts");
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleAISuggestion = async () => {
    if (!message.trim() && selectedContactIds.size === 0) {
      toast.error("Please select contacts or enter a message first");
      return;
    }

    setLoadingAI(true);
    try {
      const response = await fetch("/api/inbox/outbound/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          message: message || "",
          contactIds: Array.from(selectedContactIds),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI suggestion");
      }

      const data = await response.json();
      if (data.suggestion) {
        setMessage(data.suggestion);
        if (data.subject) {
          setSubject(data.subject);
        }
        toast.success("AI suggestion generated");
      }
    } catch (error) {
      console.error("Error getting AI suggestion:", error);
      toast.error("Failed to generate AI suggestion");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSend = async () => {
    if (selectedContactIds.size === 0) {
      toast.error("Please select at least one contact");
      return;
    }

    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    if (channel === "email" && !subject.trim()) {
      toast.error("Please enter a subject for email");
      return;
    }

    try {
      const response = await fetch("/api/inbox/outbound/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          contactIds: Array.from(selectedContactIds),
          message,
          subject: channel === "email" ? subject : undefined,
          scheduledAt: sendNow ? undefined : scheduledAt,
          multistepSequence: channel === "multi_step" ? multistepSequence : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send");
      }

      toast.success(`Outbound ${channel} sent successfully`);
      onClose();
      // Reset form
      setMessage("");
      setSubject("");
      setSelectedContactIds(new Set());
    } catch (error: any) {
      console.error("Error sending outbound:", error);
      toast.error(error.message || "Failed to send outbound");
    }
  };

  const toggleContact = (contactId: string) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(contactId)) {
      newSet.delete(contactId);
    } else {
      newSet.add(contactId);
    }
    setSelectedContactIds(newSet);
  };

  const selectedContacts = contacts.filter((c) => selectedContactIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Outreach</DialogTitle>
          <DialogDescription>
            Send personalized messages to contacts via Email, SMS, Voicemail Drop, or Multi-Step sequences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Channel Selection */}
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(value) => setChannel(value as OutboundChannel)}>
              <SelectTrigger>
                <SelectValue placeholder="Select channel" />
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="voicemail">Voicemail Drop</SelectItem>
                <SelectItem value="multi_step">Multi-Step (Email + SMS)</SelectItem>
              </SelectTrigger>
            </Select>
          </div>

          {/* Multi-Step Sequence Selection */}
          {channel === "multi_step" && (
            <div className="space-y-2">
              <Label>Sequence Type</Label>
              <Select
                value={multistepSequence}
                onValueChange={(value) => setMultistepSequence(value as "sms_then_email" | "email_then_sms")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sequence" />
                  <SelectItem value="sms_then_email">SMS → Email (next morning)</SelectItem>
                  <SelectItem value="email_then_sms">Email → SMS (2 hours later)</SelectItem>
                </SelectTrigger>
              </Select>
            </div>
          )}

          {/* AI Outreach Packs */}
          <AIOutreachPacks
            channel={channel}
            onSelectPack={(packId, angle, messageText, subjectText) => {
              setMessage(messageText);
              if (subjectText) {
                setSubject(subjectText);
              }
            }}
          />

          {/* Contact Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Contacts</Label>
              <span className="text-sm text-muted-foreground">
                {selectedContactIds.size} selected
              </span>
            </div>
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-2"
            />
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No contacts found
                </p>
              ) : (
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                      onClick={() => toggleContact(contact.id)}
                    >
                      <Checkbox
                        checked={selectedContactIds.has(contact.id)}
                        onCheckedChange={() => toggleContact(contact.id)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {contact.first_name || contact.last_name
                            ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                            : contact.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {contact.email}
                          {contact.phone && ` • ${contact.phone}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subject (Email only) */}
          {channel === "email" && (
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Message</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAISuggestion}
                disabled={loadingAI}
              >
                {loadingAI ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Suggestion
                  </>
                )}
              </Button>
            </div>
            <Textarea
              placeholder={
                channel === "sms"
                  ? "SMS message (160 characters recommended)..."
                  : channel === "voicemail"
                  ? "Voicemail script..."
                  : "Your message..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
            />
            {channel === "sms" && (
              <p className="text-xs text-muted-foreground">
                {message.length} characters
              </p>
            )}
          </div>

          {/* Scheduling */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={sendNow}
                onCheckedChange={(checked) => setSendNow(checked === true)}
              />
              <Label>Send now</Label>
            </div>
            {!sendNow && (
              <div className="space-y-2 pl-6">
                <Label>Schedule for</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={selectedContactIds.size === 0 || !message.trim()}>
            <Send className="h-4 w-4 mr-2" />
            {sendNow ? "Send Now" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

