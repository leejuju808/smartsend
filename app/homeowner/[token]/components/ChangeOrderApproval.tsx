"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

type ChangeOrderPhoto = {
  id: string;
  photo_url: string;
  label: string | null;
};

type ChangeOrder = {
  id: string;
  description: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  photos: ChangeOrderPhoto[];
  homeowner_action: {
    action: "approved" | "declined";
    created_at: string;
  } | null;
  created_at: string;
};

interface ChangeOrderApprovalProps {
  changeOrders: ChangeOrder[];
  portalToken: string;
  onUpdate?: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

export function ChangeOrderApproval({
  changeOrders,
  portalToken,
  onUpdate,
}: ChangeOrderApprovalProps) {
  const [processing, setProcessing] = useState<string | null>(null);

  const handleApprove = async (changeOrderId: string) => {
    setProcessing(changeOrderId);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homeowner-approve-change-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: portalToken,
            change_order_id: changeOrderId,
            action: "approved",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to approve change order");
        return;
      }

      if (onUpdate) {
        onUpdate();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Error approving change order:", error);
      alert("Failed to approve change order. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (changeOrderId: string) => {
    if (!confirm("Are you sure you want to decline this change order?")) {
      return;
    }

    setProcessing(changeOrderId);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homeowner-approve-change-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: portalToken,
            change_order_id: changeOrderId,
            action: "declined",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to decline change order");
        return;
      }

      if (onUpdate) {
        onUpdate();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error("Error declining change order:", error);
      alert("Failed to decline change order. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  if (changeOrders.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Change Orders
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Review and approve any additional work or materials needed
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {changeOrders.map((co) => (
          <div
            key={co.id}
            className="border border-gray-200 rounded-lg p-4 space-y-4"
          >
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <Badge
                variant={
                  co.status === "approved"
                    ? "default"
                    : co.status === "rejected"
                    ? "destructive"
                    : "secondary"
                }
                className="flex items-center gap-1"
              >
                {co.status === "approved" && <CheckCircle className="h-3 w-3" />}
                {co.status === "rejected" && <XCircle className="h-3 w-3" />}
                {co.status === "pending" && <AlertTriangle className="h-3 w-3" />}
                {co.status.charAt(0).toUpperCase() + co.status.slice(1)}
              </Badge>
              <span className="text-lg font-semibold text-gray-900">
                {formatCurrency(co.amount)}
              </span>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-700">{co.description}</p>

            {/* Photos */}
            {co.photos && co.photos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  Photos ({co.photos.length})
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {co.photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                    >
                      <img
                        src={photo.photo_url}
                        alt={photo.label || "Change order photo"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {co.status === "pending" && (
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => handleApprove(co.id)}
                  disabled={processing === co.id}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {processing === co.id ? "Processing..." : "Approve"}
                </Button>
                <Button
                  onClick={() => handleDecline(co.id)}
                  disabled={processing === co.id}
                  variant="outline"
                  className="flex-1"
                >
                  {processing === co.id ? "Processing..." : "Decline"}
                </Button>
              </div>
            )}

            {/* Homeowner Action Info */}
            {co.homeowner_action && (
              <p className="text-xs text-gray-500">
                You {co.homeowner_action.action} this change order on{" "}
                {new Date(co.homeowner_action.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
































