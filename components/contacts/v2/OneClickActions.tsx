// Block 16500 — One-Click Action Buttons
"use client";

import { Button } from "@/components/ui/Button";
import { 
  Mail, 
  Calendar, 
  Sparkles, 
  Upload, 
  FileText, 
  Flame,
  Loader2
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface OneClickActionsProps {
  contactId: string;
  contactEmail: string;
  contactName: string;
  onActionComplete?: () => void;
}

export function OneClickActions({
  contactId,
  contactEmail,
  contactName,
  onActionComplete,
}: OneClickActionsProps) {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [generatingReplies, setGeneratingReplies] = useState(false);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteType, setQuoteType] = useState("repair");

  const handleSendEmail = async () => {
    if (!emailBody.trim()) return;
    setSendingEmail(true);
    try {
      // TODO: Implement email sending API
      await fetch(`/api/contacts/${contactId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailSubject,
          body: emailBody,
        }),
      });
      setEmailModalOpen(false);
      setEmailSubject("");
      setEmailBody("");
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to send email:", error);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleBookAppointment = () => {
    // Open scheduler with contact pre-filled
    window.open(`/scheduler?contactId=${contactId}&email=${encodeURIComponent(contactEmail)}`, "_blank");
  };

  const handleGenerateReplies = async () => {
    setGeneratingReplies(true);
    try {
      // TODO: Implement AI reply generation API
      const res = await fetch(`/api/contacts/${contactId}/ai-replies`, {
        method: "POST",
      });
      const data = await res.json();
      setSuggestedReplies(data.replies || []);
    } catch (error) {
      console.error("Failed to generate replies:", error);
    } finally {
      setGeneratingReplies(false);
    }
  };

  const handleUploadPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploadingPhoto(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("contactId", contactId);
        await fetch("/api/attachments/upload", {
          method: "POST",
          body: formData,
        });
        onActionComplete?.();
      } catch (error) {
        console.error("Failed to upload photo:", error);
      } finally {
        setUploadingPhoto(false);
      }
    };
    input.click();
  };

  const handleAddQuote = async () => {
    if (!quoteAmount) return;
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimated_job_value: parseFloat(quoteAmount),
        }),
      });
      setQuoteModalOpen(false);
      setQuoteAmount("");
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to add quote:", error);
    }
  };

  const handleMoveToHot = async () => {
    try {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Hot",
        }),
      });
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to move to hot:", error);
    }
  };

  return (
    <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-lg border">
      {/* Send Email */}
      <Button
        onClick={() => setEmailModalOpen(true)}
        className="flex items-center gap-2"
        size="lg"
      >
        <Mail className="h-5 w-5" />
        Send Email
      </Button>

      {/* Book Appointment */}
      <Button
        onClick={handleBookAppointment}
        variant="outline"
        className="flex items-center gap-2"
        size="lg"
      >
        <Calendar className="h-5 w-5" />
        Book Appointment
      </Button>

      {/* Suggested Replies */}
      <Button
        onClick={handleGenerateReplies}
        variant="outline"
        className="flex items-center gap-2"
        size="lg"
        disabled={generatingReplies}
      >
        {generatingReplies ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Sparkles className="h-5 w-5" />
        )}
        Suggested Replies
      </Button>

      {/* Upload Photos */}
      <Button
        onClick={handleUploadPhoto}
        variant="outline"
        className="flex items-center gap-2"
        size="lg"
        disabled={uploadingPhoto}
      >
        {uploadingPhoto ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Upload className="h-5 w-5" />
        )}
        Upload Photos
      </Button>

      {/* Add Quote */}
      <Button
        onClick={() => setQuoteModalOpen(true)}
        variant="outline"
        className="flex items-center gap-2"
        size="lg"
      >
        <FileText className="h-5 w-5" />
        Add Quote
      </Button>

      {/* Move to HOT */}
      <Button
        onClick={handleMoveToHot}
        variant="destructive"
        className="flex items-center gap-2"
        size="lg"
      >
        <Flame className="h-5 w-5" />
        Move to HOT
      </Button>

      {/* Email Modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Email to {contactName}</DialogTitle>
            <DialogDescription>
              Compose and send an email to {contactEmail}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              placeholder="Subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <Textarea
              placeholder="Email body..."
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={10}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEmailModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={!emailBody.trim() || sendingEmail}
              >
                {sendingEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quote Modal */}
      <Dialog open={quoteModalOpen} onOpenChange={setQuoteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Quote</DialogTitle>
            <DialogDescription>
              Add a quote amount for this homeowner
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Quote Amount</label>
              <Input
                type="number"
                placeholder="0.00"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Quote Type</label>
              <select
                value={quoteType}
                onChange={(e) => setQuoteType(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="repair">Repair</option>
                <option value="replacement">Replacement</option>
                <option value="insurance">Insurance</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setQuoteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddQuote} disabled={!quoteAmount}>
                Add Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suggested Replies Display */}
      {suggestedReplies.length > 0 && (
        <div className="w-full mt-4 p-4 bg-white border rounded-lg">
          <h3 className="font-semibold mb-2">Suggested Replies (AI)</h3>
          <div className="space-y-2">
            {suggestedReplies.map((reply, idx) => (
              <div
                key={idx}
                className="p-3 bg-gray-50 rounded border cursor-pointer hover:bg-gray-100"
                onClick={() => {
                  setEmailBody(reply);
                  setEmailModalOpen(true);
                }}
              >
                <p className="text-sm">{reply}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}





















































