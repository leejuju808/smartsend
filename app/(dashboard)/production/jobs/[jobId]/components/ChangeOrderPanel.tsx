"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Send,
  Plus,
  Download,
  Image as ImageIcon
} from "lucide-react";
import { format } from "date-fns";

interface ChangeOrder {
  id: string;
  description: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at?: string;
  rejected_at?: string;
  photos?: Array<{ id: string; photo_url: string; label?: string }>;
}

interface ChangeOrderPanelProps {
  jobId: string;
}

export function ChangeOrderPanel({ jobId }: ChangeOrderPanelProps) {
  const supabase = createClientComponentClient();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    loadChangeOrders();
  }, [jobId]);

  const loadChangeOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("change_orders")
        .select(`
          *,
          change_order_photos (
            id,
            photo_url,
            label
          )
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setChangeOrders(data || []);
    } catch (error) {
      console.error("Error loading change orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendApproval = async (coId: string) => {
    setSending(coId);
    try {
      const response = await fetch("/api/change-orders/send-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_order_id: coId }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to send approval request");
        return;
      }

      alert("Approval request sent to homeowner!");
      loadChangeOrders();
    } catch (error) {
      console.error("Error sending approval:", error);
      alert("Failed to send approval request");
    } finally {
      setSending(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-500">Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-500">Pending</Badge>;
    }
  };

  const totalAdded = changeOrders
    .filter(co => co.status === "approved")
    .reduce((sum, co) => sum + Number(co.amount), 0);

  if (loading) {
    return <Card><CardContent className="p-4">Loading change orders...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Change Orders
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Total Added: <span className="font-semibold text-green-500">${totalAdded.toFixed(2)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {changeOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No change orders yet</p>
            <p className="text-sm mt-2">Create one when you discover additional work needed</p>
          </div>
        ) : (
          changeOrders.map((co) => (
            <div
              key={co.id}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusBadge(co.status)}
                    <span className="text-lg font-semibold">
                      ${Number(co.amount).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {co.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Created: {format(new Date(co.created_at), "MMM d, yyyy")}
                    </span>
                    {co.approved_at && (
                      <span className="text-green-500">
                        Approved: {format(new Date(co.approved_at), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Photos */}
              {co.photos && co.photos.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {co.photos.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative group"
                    >
                      <img
                        src={photo.photo_url}
                        alt={photo.label || "Change order photo"}
                        className="w-20 h-20 object-cover rounded border"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition rounded flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* Actions */}
              {co.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSendApproval(co.id)}
                    disabled={sending === co.id}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sending === co.id ? "Sending..." : "Send Approval Request"}
                  </Button>
                </div>
              )}

              {co.status === "approved" && (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  <span>Contract value updated automatically</span>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
































