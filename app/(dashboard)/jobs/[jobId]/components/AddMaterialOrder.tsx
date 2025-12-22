// Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Add Material Order Drawer Component

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { ReliabilityBadge, ReliabilityStats, reliabilityLabel } from "./supplier-reliability";

interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  reliability_score?: number | null;
  total_orders?: number | null;
  on_time_rate?: number | null;
  avg_delay_days?: number | null;
}

interface AddMaterialOrderProps {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddMaterialOrder({
  jobId,
  open,
  onOpenChange,
  onSuccess,
  initialNotes,
}: AddMaterialOrderProps) {
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [supplierId, setSupplierId] = useState<string>("");
  const [materials, setMaterials] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [notes, setNotes] = useState<string>(initialNotes || "");

  // Load suppliers and reset form when opening
  useEffect(() => {
    if (!open) return;
    
    // Reset form when opening
    if (initialNotes) {
      setNotes(initialNotes);
    }

    const loadSuppliers = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's workspace
        const { data: membership } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!membership?.workspace_id) return;

        const { data, error } = await supabase
          .from("suppliers")
          .select("*")
          .eq("workspace_id", membership.workspace_id)
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (error) {
          console.error("Error loading suppliers:", error);
          return;
        }

        setSuppliers(data || []);
      } catch (error) {
        console.error("Error loading suppliers:", error);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    loadSuppliers();
  }, [open, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !materials) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/jobs/material-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          supplier_id: supplierId,
          materials: materials,
          cost: cost ? parseFloat(cost) : null,
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes || null,
          status: "ordered",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create material order");
      }

      // Reset form
      setSupplierId("");
      setMaterials("");
      setCost("");
      setExpectedDeliveryDate("");
      setNotes("");

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating material order:", error);
      alert(error.message || "Failed to create material order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add Material Order</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId} required>
              <SelectTrigger id="supplier">
                <SelectValue placeholder="Select supplier">
                  {supplierId && suppliers.find((s) => s.id === supplierId) && (
                    <div className="flex items-center gap-2">
                      <span>{suppliers.find((s) => s.id === supplierId)?.name}</span>
                      <ReliabilityBadge supplier={suppliers.find((s) => s.id === supplierId)!} />
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <SelectItem value="loading" disabled>
                    Loading suppliers...
                  </SelectItem>
                ) : suppliers.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No suppliers found
                  </SelectItem>
                ) : (
                  suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.reliability_score !== null && supplier.reliability_score !== undefined && (
                        ` • ${reliabilityLabel(supplier.reliability_score)} (${supplier.reliability_score})`
                      )}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {supplierId && suppliers.find((s) => s.id === supplierId) && (
              <div className="mt-1">
                <ReliabilityStats supplier={suppliers.find((s) => s.id === supplierId)!} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="materials">Materials *</Label>
            <Textarea
              id="materials"
              placeholder="e.g., Shingles, Underlayment, Vents..."
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cost">Cost</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expectedDeliveryDate">Expected Delivery Date</Label>
            <Input
              id="expectedDeliveryDate"
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !supplierId || !materials}
              className="flex-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Order"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

