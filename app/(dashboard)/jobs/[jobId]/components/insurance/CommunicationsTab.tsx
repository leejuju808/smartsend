// Block 91000 — Communications Tab
// Complete log of all adjuster and carrier communications

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Phone,
  Mail,
  FileText,
  MessageSquare,
  Calendar,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface InsuranceCommunication {
  id: string;
  claim_id: string;
  direction: "incoming" | "outgoing";
  method: "phone" | "email" | "note" | "file" | "meeting";
  content: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  attachments: string[];
  timestamp: string;
  created_by: string | null;
  created_at: string;
}

export function CommunicationsTab({
  claimId,
  jobId,
}: {
  claimId: string;
  jobId: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data, error, mutate } = useSWR<InsuranceCommunication[]>(
    `/api/jobs/${jobId}/insurance/communications?claimId=${claimId}`,
    fetcher
  );

  const communications = data || [];

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "phone":
        return <Phone className="w-4 h-4" />;
      case "email":
        return <Mail className="w-4 h-4" />;
      case "note":
        return <FileText className="w-4 h-4" />;
      case "file":
        return <FileText className="w-4 h-4" />;
      case "meeting":
        return <Calendar className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "phone":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "email":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "meeting":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-50">Communication Log</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Track all adjuster and carrier communications
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Log Communication
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-zinc-50">Log Communication</DialogTitle>
            </DialogHeader>
            <CommunicationForm
              claimId={claimId}
              jobId={jobId}
              onSuccess={() => {
                setIsDialogOpen(false);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {communications.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="p-8 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-sm text-zinc-400">
              No communications logged yet. Start tracking your adjuster interactions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {communications.map((comm) => (
            <Card key={comm.id} className="border-zinc-800 bg-zinc-900">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded ${
                      comm.direction === "incoming"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-green-500/10 text-green-400"
                    }`}
                  >
                    {comm.direction === "incoming" ? (
                      <ArrowDown className="w-4 h-4" />
                    ) : (
                      <ArrowUp className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getMethodColor(comm.method)}>
                        <span className="flex items-center gap-1">
                          {getMethodIcon(comm.method)}
                          {comm.method}
                        </span>
                      </Badge>
                      <span className="text-xs text-zinc-400">
                        {format(new Date(comm.timestamp), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                    {comm.contact_name && (
                      <div className="text-sm font-semibold text-zinc-50 mb-1">
                        {comm.contact_name}
                      </div>
                    )}
                    {(comm.contact_phone || comm.contact_email) && (
                      <div className="text-xs text-zinc-400 mb-2">
                        {comm.contact_phone && <span>{comm.contact_phone}</span>}
                        {comm.contact_phone && comm.contact_email && <span> • </span>}
                        {comm.contact_email && <span>{comm.contact_email}</span>}
                      </div>
                    )}
                    {comm.content && (
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                        {comm.content}
                      </p>
                    )}
                    {comm.attachments && comm.attachments.length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {comm.attachments.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline"
                          >
                            Attachment {idx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CommunicationForm({
  claimId,
  jobId,
  onSuccess,
}: {
  claimId: string;
  jobId: string;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    direction: "outgoing" as "incoming" | "outgoing",
    method: "phone" as "phone" | "email" | "note" | "file" | "meeting",
    content: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch(`/api/jobs/${jobId}/insurance/communications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_id: claimId,
        ...formData,
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-zinc-300">Direction</Label>
          <Select
            value={formData.direction}
            onValueChange={(value: "incoming" | "outgoing") =>
              setFormData({ ...formData, direction: value })
            }
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="incoming">Incoming</SelectItem>
              <SelectItem value="outgoing">Outgoing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-zinc-300">Method</Label>
          <Select
            value={formData.method}
            onValueChange={(
              value: "phone" | "email" | "note" | "file" | "meeting"
            ) => setFormData({ ...formData, method: value })}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="file">File</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(formData.method === "phone" || formData.method === "email") && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-zinc-300">Contact Name</Label>
            <Input
              value={formData.contact_name}
              onChange={(e) =>
                setFormData({ ...formData, contact_name: e.target.value })
              }
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          {formData.method === "phone" && (
            <div>
              <Label className="text-zinc-300">Phone</Label>
              <Input
                value={formData.contact_phone}
                onChange={(e) =>
                  setFormData({ ...formData, contact_phone: e.target.value })
                }
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          )}
          {formData.method === "email" && (
            <div>
              <Label className="text-zinc-300">Email</Label>
              <Input
                type="email"
                value={formData.contact_email}
                onChange={(e) =>
                  setFormData({ ...formData, contact_email: e.target.value })
                }
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <Label className="text-zinc-300">Content / Notes</Label>
        <Textarea
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          className="bg-zinc-800 border-zinc-700"
          rows={5}
          placeholder="Enter communication details..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onSuccess}
          className="border-zinc-700"
        >
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          Log Communication
        </Button>
      </div>
    </form>
  );
}



























