"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CreateInvoiceFormProps {
  orgId: string;
}

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export function CreateInvoiceForm({ orgId }: CreateInvoiceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    job_id: "",
    homeowner_name: "",
    homeowner_email: "",
    amount_due: "",
    due_date: "",
    invoice_type: "full",
    notes: "",
    create_payment_link: true,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: "1",
      description: "",
      quantity: 1,
      unit_price: 0,
      total: 0,
    },
  ]);

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems((items) =>
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === "quantity" || field === "unit_price") {
            updated.total = updated.quantity * updated.unit_price;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        description: "",
        quantity: 1,
        unit_price: 0,
        total: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const calculateTotal = () => {
    if (lineItems.some((item) => item.description)) {
      return lineItems.reduce((sum, item) => sum + item.total, 0);
    }
    return parseFloat(formData.amount_due) || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const total = calculateTotal();
      const hasLineItems = lineItems.some((item) => item.description);

      const payload = {
        ...formData,
        amount_due: total,
        line_items: hasLineItems
          ? lineItems
              .filter((item) => item.description)
              .map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total,
              }))
          : [],
      };

      const response = await fetch("/api/payments/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create invoice");
      }

      const data = await response.json();
      toast.success("Invoice created successfully!");

      if (data.payment_link) {
        toast.info("Payment link created", {
          description: "Share this link with the homeowner to collect payment",
        });
      }

      router.push(`/payments/invoices/${data.invoice.id}`);
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="homeowner_name">Homeowner Name *</Label>
              <Input
                id="homeowner_name"
                value={formData.homeowner_name}
                onChange={(e) =>
                  setFormData({ ...formData, homeowner_name: e.target.value })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="homeowner_email">Homeowner Email *</Label>
              <Input
                id="homeowner_email"
                type="email"
                value={formData.homeowner_email}
                onChange={(e) =>
                  setFormData({ ...formData, homeowner_email: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="invoice_type">Invoice Type</Label>
              <Select
                value={formData.invoice_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, invoice_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Invoice</SelectItem>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="progress">Progress Payment</SelectItem>
                  <SelectItem value="change_order">Change Order</SelectItem>
                  <SelectItem value="supplement">Supplement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="job_id">Job ID (Optional)</Label>
            <Input
              id="job_id"
              value={formData.job_id}
              onChange={(e) =>
                setFormData({ ...formData, job_id: e.target.value })
              }
              placeholder="Link to a job"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Additional notes..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Line Items</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLineItem}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.map((item) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <Label>Description</Label>
                <Input
                  value={item.description}
                  onChange={(e) =>
                    updateLineItem(item.id, "description", e.target.value)
                  }
                  placeholder="e.g., Tear-off labor"
                />
              </div>
              <div className="col-span-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) =>
                    updateLineItem(
                      item.id,
                      "quantity",
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>Unit Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) =>
                    updateLineItem(
                      item.id,
                      "unit_price",
                      parseFloat(e.target.value) || 0
                    )
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>Total</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.total.toFixed(2)}
                  disabled
                  className="bg-gray-50"
                />
              </div>
              <div className="col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLineItem(item.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {!lineItems.some((item) => item.description) && (
            <div className="mt-4">
              <Label htmlFor="amount_due">Total Amount (if no line items)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="amount_due"
                  type="number"
                  step="0.01"
                  value={formData.amount_due}
                  onChange={(e) =>
                    setFormData({ ...formData, amount_due: e.target.value })
                  }
                  className="pl-8"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          <div className="pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold">Total:</span>
              <span className="text-2xl font-bold">
                ${calculateTotal().toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="create_payment_link"
          checked={formData.create_payment_link}
          onChange={(e) =>
            setFormData({
              ...formData,
              create_payment_link: e.target.checked,
            })
          }
        />
        <Label htmlFor="create_payment_link">
          Create Stripe payment link automatically
        </Label>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Invoice"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}



























