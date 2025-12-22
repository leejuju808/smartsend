// Block 228000 — Insurance Supplements Tab Component
"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  DollarSign,
  Mail,
  Loader2,
  Download,
  Sparkles,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Supplement {
  id: string;
  job_id: string;
  reason: string;
  description: string;
  requested_amount: number;
  approved_amount?: number;
  status: string;
  adjuster_email?: string;
  adjuster_name?: string;
  adjuster_phone?: string;
  documents_url?: string;
  sent_at?: string;
  last_followup_at?: string;
  followup_count: number;
  next_followup_date?: string;
  created_at: string;
  supplement_items?: SupplementItem[];
}

interface SupplementItem {
  id: string;
  xactimate_code?: string;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export function InsuranceSupplementsTab({ jobId }: { jobId: string }) {
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Fetch supplements
  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/supplements`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const supplements: Supplement[] = data?.supplements || [];

  const filteredSupplements = supplements.filter((s) => {
    if (activeStatus === "all") return true;
    return s.status === activeStatus;
  });

  const handleGenerateDocument = async (supplementId: string) => {
    try {
      const response = await fetch(
        `/api/supplements/generate-document`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplement_id: supplementId }),
        }
      );

      const result = await response.json();
      if (result.success) {
        toast.success("Supplement document generated!");
        // In production, would open PDF or download
      } else {
        toast.error(result.error || "Failed to generate document");
      }
    } catch (error) {
      toast.error("Failed to generate document");
    }
  };

  const handleSendSupplement = async (supplementId: string, adjusterInfo: any) => {
    try {
      const response = await fetch("/api/supplements/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplement_id: supplementId,
          ...adjusterInfo,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Supplement sent to adjuster!");
        mutate();
      } else {
        toast.error(result.error || "Failed to send supplement");
      }
    } catch (error) {
      toast.error("Failed to send supplement");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      sent: "default",
      negotiating: "secondary",
      approved: "default",
      denied: "destructive",
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "denied":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "sent":
      case "negotiating":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50">Insurance Supplements</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Manage insurance supplement requests and approvals
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Supplement
        </Button>
      </div>

      <Tabs value={activeStatus} onValueChange={setActiveStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="negotiating">Negotiating</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="denied">Denied</TabsTrigger>
        </TabsList>

        <TabsContent value={activeStatus} className="mt-4">
          {filteredSupplements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-zinc-500 mb-4" />
                <p className="text-zinc-400">No supplements found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredSupplements.map((supplement) => (
                <Card key={supplement.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(supplement.status)}
                          <CardTitle className="text-lg">{supplement.reason}</CardTitle>
                          {getStatusBadge(supplement.status)}
                        </div>
                        <CardDescription>{supplement.description}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-zinc-50">
                          {formatCurrency(supplement.requested_amount)}
                        </div>
                        {supplement.approved_amount && (
                          <div className="text-sm text-green-500">
                            Approved: {formatCurrency(supplement.approved_amount)}
                          </div>
                        )}
                        <div className="text-xs text-zinc-400">
                          Created {format(new Date(supplement.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {supplement.supplement_items && supplement.supplement_items.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-zinc-300 mb-2">
                          Xactimate Line Items
                        </h4>
                        <div className="space-y-1">
                          {supplement.supplement_items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-sm text-zinc-400"
                            >
                              <span>
                                {item.xactimate_code && (
                                  <span className="font-mono text-xs mr-2">
                                    {item.xactimate_code}
                                  </span>
                                )}
                                {item.qty}x {item.description}
                              </span>
                              <span>{formatCurrency(item.line_total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {supplement.adjuster_email && (
                      <div className="mb-4 p-3 bg-zinc-900 rounded-lg">
                        <div className="text-sm text-zinc-400">
                          <div className="font-semibold text-zinc-300 mb-1">Adjuster Info</div>
                          <div>{supplement.adjuster_name || "N/A"}</div>
                          <div>{supplement.adjuster_email}</div>
                          {supplement.adjuster_phone && <div>{supplement.adjuster_phone}</div>}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-4">
                      {supplement.status === "draft" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerateDocument(supplement.id)}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate Document
                          </Button>
                          <SendSupplementDialog
                            supplementId={supplement.id}
                            onSend={handleSendSupplement}
                          />
                        </>
                      )}
                      {supplement.status === "sent" && supplement.next_followup_date && (
                        <div className="text-xs text-zinc-400">
                          Next follow-up: {format(new Date(supplement.next_followup_date), "MMM d, yyyy")}
                          {supplement.followup_count > 0 && ` (${supplement.followup_count} sent)`}
                        </div>
                      )}
                      {supplement.documents_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(supplement.documents_url, "_blank")}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showCreateDialog && (
        <CreateSupplementDialog
          jobId={jobId}
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onCreate={async (data) => {
            try {
              const response = await fetch("/api/supplements/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ job_id: jobId, ...data }),
              });

              const result = await response.json();
              if (result.success) {
                toast.success("Supplement created!");
                setShowCreateDialog(false);
                mutate();
              } else {
                toast.error(result.error || "Failed to create supplement");
              }
            } catch (error) {
              toast.error("Failed to create supplement");
            }
          }}
        />
      )}
    </div>
  );
}

function SendSupplementDialog({
  supplementId,
  onSend,
}: {
  supplementId: string;
  onSend: (id: string, info: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adjusterEmail, setAdjusterEmail] = useState("");
  const [adjusterName, setAdjusterName] = useState("");
  const [adjusterPhone, setAdjusterPhone] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(supplementId, {
      adjuster_email: adjusterEmail,
      adjuster_name: adjusterName,
      adjuster_phone: adjusterPhone,
    });
    setOpen(false);
  };

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4 mr-2" />
        Send to Adjuster
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Send to Adjuster</CardTitle>
          <CardDescription>Enter adjuster contact information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Adjuster Email *</Label>
              <Input
                type="email"
                value={adjusterEmail}
                onChange={(e) => setAdjusterEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Adjuster Name</Label>
              <Input
                value={adjusterName}
                onChange={(e) => setAdjusterName(e.target.value)}
              />
            </div>
            <div>
              <Label>Adjuster Phone</Label>
              <Input
                value={adjusterPhone}
                onChange={(e) => setAdjusterPhone(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateSupplementDialog({
  jobId,
  open,
  onClose,
  onCreate,
}: {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState([
    { xactimate_code: "", description: "", qty: 1, unit_price: 0 },
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      reason,
      description,
      items: items.filter((item) => item.description.trim() !== ""),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Create Insurance Supplement</CardTitle>
          <CardDescription>
            Create a new supplement request for additional covered work
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Additional decking discovered"
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe why this supplement is needed..."
                required
                rows={4}
              />
            </div>
            <div>
              <Label>Xactimate Line Items</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Xactimate Code"
                      value={item.xactimate_code}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].xactimate_code = e.target.value;
                        setItems(newItems);
                      }}
                      className="w-32"
                    />
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].description = e.target.value;
                        setItems(newItems);
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].qty = Number(e.target.value);
                        setItems(newItems);
                      }}
                      className="w-20"
                    />
                    <Input
                      type="number"
                      placeholder="Unit Price"
                      value={item.unit_price}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].unit_price = Number(e.target.value);
                        setItems(newItems);
                      }}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setItems(items.filter((_, i) => i !== idx));
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems([
                      ...items,
                      { xactimate_code: "", description: "", qty: 1, unit_price: 0 },
                    ])
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line Item
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Create Supplement</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

























