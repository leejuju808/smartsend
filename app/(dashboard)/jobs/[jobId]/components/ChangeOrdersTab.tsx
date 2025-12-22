// Block 228000 — Change Orders Tab Component
"use client";

import { useState, useEffect } from "react";
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
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChangeOrder {
  id: string;
  job_id: string;
  reason: string;
  description: string;
  added_cost: number;
  status: string;
  signature_url?: string;
  signed_at?: string;
  signed_by?: string;
  portal_token?: string;
  created_at: string;
  sent_at?: string;
  viewed_at?: string;
  change_order_items?: ChangeOrderItem[];
}

interface ChangeOrderItem {
  id: string;
  label: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export function ChangeOrdersTab({ jobId }: { jobId: string }) {
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // Fetch change orders
  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/change-orders`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const changeOrders: ChangeOrder[] = data?.change_orders || [];

  const filteredOrders = changeOrders.filter((co) => {
    if (activeStatus === "all") return true;
    return co.status === activeStatus;
  });

  const handleCreateChangeOrder = async (formData: any) => {
    setCreating(true);
    try {
      const response = await fetch("/api/change-orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          ...formData,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Change order created!");
        setShowCreateDialog(false);
        mutate();
      } else {
        toast.error(result.error || "Failed to create change order");
      }
    } catch (error) {
      toast.error("Failed to create change order");
    } finally {
      setCreating(false);
    }
  };

  const handleSendChangeOrder = async (changeOrderId: string) => {
    try {
      const response = await fetch("/api/change-orders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_order_id: changeOrderId }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Change order sent to homeowner!");
        mutate();
      } else {
        toast.error(result.error || "Failed to send change order");
      }
    } catch (error) {
      toast.error("Failed to send change order");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      pending: "secondary",
      sent: "default",
      viewed: "default",
      approved: "default",
      declined: "destructive",
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
      case "declined":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "sent":
      case "viewed":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50">Change Orders</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Track and manage additional work approvals
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Change Order
        </Button>
      </div>

      <Tabs value={activeStatus} onValueChange={setActiveStatus}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="declined">Declined</TabsTrigger>
        </TabsList>

        <TabsContent value={activeStatus} className="mt-4">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-zinc-500 mb-4" />
                <p className="text-zinc-400">No change orders found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((co) => (
                <Card key={co.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(co.status)}
                          <CardTitle className="text-lg">{co.reason}</CardTitle>
                          {getStatusBadge(co.status)}
                        </div>
                        <CardDescription>{co.description}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-zinc-50">
                          {formatCurrency(co.added_cost)}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Created {format(new Date(co.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {co.change_order_items && co.change_order_items.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-zinc-300 mb-2">
                          Line Items
                        </h4>
                        <div className="space-y-1">
                          {co.change_order_items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-sm text-zinc-400"
                            >
                              <span>
                                {item.qty}x {item.label}
                              </span>
                              <span>{formatCurrency(item.line_total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-4">
                      {co.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => handleSendChangeOrder(co.id)}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Send to Homeowner
                        </Button>
                      )}
                      {co.portal_token && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            window.open(
                              `/homeowner/change-order/${co.portal_token}`,
                              "_blank"
                            );
                          }}
                        >
                          View Portal Link
                        </Button>
                      )}
                      {co.signed_at && (
                        <div className="text-xs text-zinc-400">
                          Signed by {co.signed_by} on{" "}
                          {format(new Date(co.signed_at), "MMM d, yyyy")}
                        </div>
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
        <CreateChangeOrderDialog
          jobId={jobId}
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreateChangeOrder}
          creating={creating}
        />
      )}
    </div>
  );
}

function CreateChangeOrderDialog({
  jobId,
  open,
  onClose,
  onCreate,
  creating,
}: {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
  creating: boolean;
}) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState([
    { label: "", qty: 1, unit_price: 0 },
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      reason,
      description,
      items: items.filter((item) => item.label.trim() !== ""),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Create Change Order</CardTitle>
          <CardDescription>
            Add a new change order for additional work
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Additional decking required"
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the additional work needed..."
                required
                rows={4}
              />
            </div>
            <div>
              <Label>Line Items</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      placeholder="Item description"
                      value={item.label}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[idx].label = e.target.value;
                        setItems(newItems);
                      }}
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
                    setItems([...items, { label: "", qty: 1, unit_price: 0 }])
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
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Change Order
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

























