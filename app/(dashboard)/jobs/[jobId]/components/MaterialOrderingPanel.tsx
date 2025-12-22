// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// Enhanced Material Ordering Panel
// Full material ordering workflow: Generate → Edit → Send → Track

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { 
  Plus, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Package,
  RefreshCw,
  Edit,
  Clock,
  Truck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MaterialOrderItem {
  id?: string;
  item_name: string;
  quantity: number;
  unit: string;
  brand?: string;
  color?: string;
  unit_price?: number;
  total_price?: number;
}

interface MaterialOrder {
  id: string;
  job_id: string;
  supplier_id?: string;
  status: "draft" | "sent" | "confirmed" | "delivered" | "delayed" | "cancelled";
  eta?: string;
  delivered_at?: string;
  po_number?: string;
  po_pdf_url?: string;
  job_site_address?: string;
  delivery_date?: string;
  delivery_instructions?: string;
  crew_details?: string;
  supplier_confirmed?: boolean;
  supplier_confirmed_at?: string;
  notes?: string;
  suppliers?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  material_order_items?: MaterialOrderItem[];
  roofing_jobs?: {
    id: string;
    title?: string;
    address?: string;
  };
}

interface MaterialOrderingPanelProps {
  jobId: string;
  workspaceId: string;
}

export function MaterialOrderingPanel({ jobId, workspaceId }: MaterialOrderingPanelProps) {
  const supabase = createClient();
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>("");
  const [crewDetails, setCrewDetails] = useState<string>("");

  // Fetch current order
  const { data: orderData, error, mutate } = useSWR<{ order: MaterialOrder | null }>(
    `/api/material-orders?job_id=${jobId}`,
    fetcher
  );

  // Fetch suppliers
  const { data: suppliersData } = useSWR<{ suppliers: any[] }>(
    `/api/suppliers?workspace_id=${workspaceId}`,
    fetcher
  );

  const order = orderData?.order;
  const suppliers = suppliersData?.suppliers || [];

  const handleGenerate = async () => {
    if (!selectedSupplier && suppliers.length > 0) {
      alert("Please select a supplier first");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/material-orders/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          supplier_id: selectedSupplier || null,
          delivery_date: deliveryDate || null,
          delivery_instructions: deliveryInstructions || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate material order");
      }

      mutate();
      setGenerateDialogOpen(false);
      setSelectedSupplier("");
      setDeliveryDate("");
      setDeliveryInstructions("");
    } catch (error: any) {
      console.error("Error generating order:", error);
      alert(error.message || "Failed to generate material order");
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!order) return;

    setSending(true);
    try {
      const response = await fetch(`/api/material-orders/${order.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send PO");
      }

      mutate();
      setSendDialogOpen(false);
      alert("PO sent successfully!");
    } catch (error: any) {
      console.error("Error sending PO:", error);
      alert(error.message || "Failed to send PO");
    } finally {
      setSending(false);
    }
  };

  const handleUpdateOrder = async () => {
    if (!order) return;

    try {
      const response = await fetch(`/api/material-orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: selectedSupplier || order.supplier_id,
          delivery_date: deliveryDate || order.delivery_date,
          delivery_instructions: deliveryInstructions || order.delivery_instructions,
          crew_details: crewDetails || order.crew_details,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update order");
      }

      mutate();
      setEditDialogOpen(false);
    } catch (error: any) {
      console.error("Error updating order:", error);
      alert(error.message || "Failed to update order");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      sent: "secondary",
      confirmed: "default",
      delivered: "default",
      delayed: "destructive",
      cancelled: "outline",
    };

    const colors: Record<string, string> = {
      draft: "text-zinc-400",
      sent: "text-blue-400",
      confirmed: "text-green-400",
      delivered: "text-green-500",
      delayed: "text-red-400",
      cancelled: "text-zinc-500",
    };

    return (
      <Badge variant={variants[status] || "outline"} className={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error loading material order: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-50">Material Order</h3>
        {!order && (
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Generate Order
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Material Order</DialogTitle>
                <DialogDescription>
                  Auto-generate material list from roof measurements
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Supplier</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Delivery Date</Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Delivery Instructions</Label>
                  <Textarea
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Leave at driveway, call before delivery, etc."
                  />
                </div>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Package className="h-4 w-4 mr-2" />
                      Generate Order
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Order Display */}
      {order ? (
        <div className="space-y-4">
          {/* Order Status Card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-50">
                  Order {order.po_number || `#${order.id.substring(0, 8)}`}
                </span>
                {getStatusBadge(order.status)}
              </div>
              <div className="flex gap-2">
                {order.status === "draft" && (
                  <>
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Material Order</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Supplier</Label>
                            <Select
                              value={selectedSupplier || order.supplier_id || ""}
                              onValueChange={setSelectedSupplier}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select supplier" />
                              </SelectTrigger>
                              <SelectContent>
                                {suppliers.map((supplier) => (
                                  <SelectItem key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Delivery Date</Label>
                            <Input
                              type="date"
                              value={deliveryDate || order.delivery_date || ""}
                              onChange={(e) => setDeliveryDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Delivery Instructions</Label>
                            <Textarea
                              value={deliveryInstructions || order.delivery_instructions || ""}
                              onChange={(e) => setDeliveryInstructions(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Crew Details</Label>
                            <Input
                              value={crewDetails || order.crew_details || ""}
                              onChange={(e) => setCrewDetails(e.target.value)}
                              placeholder="Crew contact info"
                            />
                          </div>
                          <Button onClick={handleUpdateOrder}>Save Changes</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Send className="h-3 w-3 mr-1" />
                          Send PO
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Send Purchase Order</DialogTitle>
                          <DialogDescription>
                            Send PO to {order.suppliers?.name || "supplier"} at{" "}
                            {order.suppliers?.email || "their email"}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <p className="text-sm text-zinc-400">
                            This will send the purchase order PDF to the supplier's email address.
                          </p>
                          <Button onClick={handleSend} disabled={sending}>
                            {sending ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                Send PO
                              </>
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            </div>

            {/* Supplier Info */}
            {order.suppliers && (
              <div className="text-xs text-zinc-400">
                Supplier: <span className="text-zinc-300">{order.suppliers.name}</span>
                {order.suppliers.email && (
                  <> • {order.suppliers.email}</>
                )}
              </div>
            )}

            {/* Delivery Info */}
            {(order.delivery_date || order.eta) && (
              <div className="flex items-center gap-4 text-xs text-zinc-400">
                {order.delivery_date && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Delivery: {format(new Date(order.delivery_date), "MMM d, yyyy")}
                  </div>
                )}
                {order.eta && (
                  <div className="flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    ETA: {format(new Date(order.eta), "MMM d, yyyy HH:mm")}
                  </div>
                )}
              </div>
            )}

            {/* Supplier Confirmation */}
            {order.supplier_confirmed && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Confirmed by supplier
                {order.supplier_confirmed_at && (
                  <> • {format(new Date(order.supplier_confirmed_at), "MMM d, yyyy")}</>
                )}
              </div>
            )}
          </div>

          {/* Material Items List */}
          {order.material_order_items && order.material_order_items.length > 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                Materials
              </h4>
              <div className="space-y-2">
                {order.material_order_items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center justify-between text-sm py-2 border-b border-zinc-800 last:border-0"
                  >
                    <div>
                      <div className="text-zinc-50 font-medium">{item.item_name}</div>
                      {item.brand && (
                        <div className="text-xs text-zinc-400">{item.brand}</div>
                      )}
                      {item.color && (
                        <div className="text-xs text-zinc-400">Color: {item.color}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-zinc-50">
                        {item.quantity} {item.unit}
                      </div>
                      {item.total_price && (
                        <div className="text-xs text-zinc-400">
                          ${item.total_price.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs text-zinc-400">
            No material order yet. Click "Generate Order" to create one from roof measurements.
          </p>
        </div>
      )}
    </div>
  );
}































