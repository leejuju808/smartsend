// Block 241000 — SmartSend Roofing Supplier Hub v1
// PO Builder Screen

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Save, Send, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CreatePOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    supplier_id: searchParams.get("supplier_id") || "",
    job_id: "",
    delivery_date: "",
    delivery_window: "Any",
    notes: "",
  });

  const [items, setItems] = useState([
    { material_name: "", qty: 1, unit: "pieces", price: 0 },
  ]);

  useEffect(() => {
    async function getCompany() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: companies } = await supabase
          .from("roofing_companies")
          .select("id")
          .eq("owner_id", user.id)
          .eq("is_active", true)
          .limit(1);
        
        if (companies && companies.length > 0) {
          setCompanyId(companies[0].id);
        }
      }
    }
    getCompany();
  }, [supabase]);

  const { data: suppliersData } = useSWR<{ suppliers: any[] }>(
    companyId ? `/api/suppliers?company_id=${companyId}` : null,
    fetcher
  );

  const suppliers = suppliersData?.suppliers || [];

  const addItem = () => {
    setItems([...items, { material_name: "", qty: 1, unit: "pieces", price: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!companyId || !formData.supplier_id || items.length === 0) {
      alert("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/supplier/po/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          supplier_id: formData.supplier_id,
          job_id: formData.job_id || null,
          delivery_date: formData.delivery_date || null,
          delivery_window: formData.delivery_window,
          items: items.filter((item) => item.material_name),
          notes: formData.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create PO");
      }

      const { po } = await response.json();
      router.push(`/supplier-hub/purchase-orders/${po.id}`);
    } catch (error: any) {
      console.error("Error creating PO:", error);
      alert(error.message || "Failed to create PO");
    } finally {
      setLoading(false);
    }
  };

  const totalCost = items.reduce((sum, item) => sum + (item.qty * item.price), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/supplier-hub/purchase-orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Create Purchase Order</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Build a new purchase order for materials
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
            <h2 className="text-lg font-semibold">PO Details</h2>
            
            <div>
              <Label>Supplier *</Label>
              <Select
                value={formData.supplier_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, supplier_id: value })
                }
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
              <Label>Job (Optional)</Label>
              <Input
                value={formData.job_id}
                onChange={(e) =>
                  setFormData({ ...formData, job_id: e.target.value })
                }
                placeholder="Job ID"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Delivery Date</Label>
                <Input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) =>
                    setFormData({ ...formData, delivery_date: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Delivery Window</Label>
                <Select
                  value={formData.delivery_window}
                  onValueChange={(value) =>
                    setFormData({ ...formData, delivery_window: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                    <SelectItem value="Any">Any</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes for supplier..."
              />
            </div>
          </div>
        </div>

        {/* Right: Items */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Items</h2>
              <Button onClick={addItem} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>

            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={item.material_name}
                          onChange={(e) =>
                            updateItem(index, "material_name", e.target.value)
                          }
                          placeholder="Material name"
                          className="w-48"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) =>
                            updateItem(index, "qty", parseFloat(e.target.value) || 0)
                          }
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.unit}
                          onValueChange={(value) =>
                            updateItem(index, "unit", value)
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pieces">Pieces</SelectItem>
                            <SelectItem value="bundles">Bundles</SelectItem>
                            <SelectItem value="squares">Squares</SelectItem>
                            <SelectItem value="rolls">Rolls</SelectItem>
                            <SelectItem value="sqft">Sq Ft</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.price}
                          onChange={(e) =>
                            updateItem(index, "price", parseFloat(e.target.value) || 0)
                          }
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        ${(item.qty * item.price).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <span className="text-lg font-semibold">Total:</span>
              <span className="text-xl font-bold">${totalCost.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Creating..." : "Create PO"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

























