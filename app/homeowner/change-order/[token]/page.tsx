// Block 228000 — Homeowner Change Order Approval Page
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Image as ImageIcon, Loader2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

interface ChangeOrderItem {
  id: string;
  label: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

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
  created_at: string;
  change_order_items?: ChangeOrderItem[];
}

export default function ChangeOrderApprovalPage() {
  const params = useParams();
  const token = params.token as string;
  const [changeOrder, setChangeOrder] = useState<ChangeOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) return;

    const fetchChangeOrder = async () => {
      try {
        const response = await fetch(`/api/change-orders/by-token?token=${token}`);
        const data = await response.json();

        if (data.success && data.change_order) {
          setChangeOrder(data.change_order);
        } else {
          toast.error(data.error || "Change order not found");
        }
      } catch (error) {
        toast.error("Failed to load change order");
      } finally {
        setLoading(false);
      }
    };

    fetchChangeOrder();
  }, [token]);

  const handleApprove = async () => {
    if (!changeOrder) return;

    setProcessing(true);
    try {
      const response = await fetch("/api/change-orders/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portal_token: token,
          signed_by: "Homeowner",
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Change order approved!");
        setChangeOrder({ ...changeOrder, status: "approved" });
      } else {
        toast.error(result.error || "Failed to approve change order");
      }
    } catch (error) {
      toast.error("Failed to approve change order");
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!changeOrder) return;

    if (!confirm("Are you sure you want to decline this change order?")) {
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/change-orders/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portal_token: token,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success("Change order declined");
        setChangeOrder({ ...changeOrder, status: "declined" });
      } else {
        toast.error(result.error || "Failed to decline change order");
      }
    } catch (error) {
      toast.error("Failed to decline change order");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!changeOrder) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">Change order not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isApproved = changeOrder.status === "approved";
  const isDeclined = changeOrder.status === "declined";
  const isPending = changeOrder.status === "sent" || changeOrder.status === "pending";

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto py-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Change Order Approval
          </h1>
          <p className="text-gray-600">
            Please review and approve or decline this additional work request
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{changeOrder.reason}</CardTitle>
                <CardDescription className="mt-2">
                  {changeOrder.description}
                </CardDescription>
              </div>
              <Badge
                variant={
                  isApproved
                    ? "default"
                    : isDeclined
                    ? "destructive"
                    : "secondary"
                }
              >
                {changeOrder.status.charAt(0).toUpperCase() +
                  changeOrder.status.slice(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {changeOrder.change_order_items &&
              changeOrder.change_order_items.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Line Items</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left">Item</th>
                          <th className="px-4 py-2 text-right">Quantity</th>
                          <th className="px-4 py-2 text-right">Unit Price</th>
                          <th className="px-4 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changeOrder.change_order_items.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-4 py-3">{item.label}</td>
                            <td className="px-4 py-3 text-right">{item.qty}</td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(item.unit_price)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {formatCurrency(item.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2">
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-3 text-right font-bold"
                          >
                            Total Additional Cost:
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-lg">
                            {formatCurrency(changeOrder.added_cost)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-900 mb-2">
                What happens next?
              </h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>
                  If approved, this amount will be added to your total contract
                  value
                </li>
                <li>Your payment schedule will be updated automatically</li>
                <li>You will receive a confirmation email</li>
              </ul>
            </div>

            {changeOrder.signed_at && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-semibold">
                    Approved by {changeOrder.signed_by || "Homeowner"} on{" "}
                    {format(new Date(changeOrder.signed_at), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
              </div>
            )}

            {isPending && (
              <div className="flex gap-4">
                <Button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve Change Order
                </Button>
                <Button
                  onClick={handleDecline}
                  disabled={processing}
                  variant="destructive"
                  className="flex-1"
                  size="lg"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Decline
                </Button>
              </div>
            )}

            {isApproved && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-2" />
                <p className="font-semibold text-green-900">
                  This change order has been approved
                </p>
              </div>
            )}

            {isDeclined && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                <XCircle className="h-12 w-12 mx-auto text-red-600 mb-2" />
                <p className="font-semibold text-red-900">
                  This change order has been declined
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-500">
          <p>Created on {format(new Date(changeOrder.created_at), "MMM d, yyyy")}</p>
        </div>
      </div>
    </div>
  );
}

























