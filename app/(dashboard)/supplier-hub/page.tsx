// Block 241000 — SmartSend Roofing Supplier Hub v1
// Supplier Hub Main Page
// Shows supplier list with PO counts, ratings, and quick actions

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Building2, Package, TrendingUp, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SupplierHubPage() {
  const router = useRouter();
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    delivery_hours: "",
    lead_time_days: 2,
    notes: "",
  });

  useEffect(() => {
    async function getCompany() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Try to get company_id from cookie or get first roofing company
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

  const { data, error, mutate } = useSWR<{ suppliers: any[] }>(
    companyId ? `/api/suppliers?company_id=${companyId}` : null,
    fetcher
  );

  const suppliers = data?.suppliers || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      alert("Company not found");
      return;
    }

    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          company_id: companyId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save supplier");
      }

      mutate();
      setDialogOpen(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        delivery_hours: "",
        lead_time_days: 2,
        notes: "",
      });
    } catch (error: any) {
      console.error("Error saving supplier:", error);
      alert(error.message || "Failed to save supplier");
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">Error loading suppliers: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Supplier Hub</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage suppliers, track orders, and control costs
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/supplier-hub/purchase-orders">
            <Button variant="outline">
              <Package className="h-4 w-4 mr-2" />
              Purchase Orders
            </Button>
          </Link>
          <Link href="/supplier-hub/reconciliation">
            <Button variant="outline">
              <TrendingUp className="h-4 w-4 mr-2" />
              Reconciliation
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Supplier</DialogTitle>
                <DialogDescription>
                  Add a new material supplier to your database
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Supplier Name *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="ABC Supply, Beacon, etc."
                      required
                    />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="delivery@supplier.com"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Phone</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <Label>Lead Time (days)</Label>
                    <Input
                      type="number"
                      value={formData.lead_time_days}
                      onChange={(e) =>
                        setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 2 })
                      }
                      placeholder="2"
                    />
                  </div>
                </div>

                <div>
                  <Label>Address</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="123 Main St, City, State ZIP"
                  />
                </div>

                <div>
                  <Label>Delivery Hours</Label>
                  <Input
                    value={formData.delivery_hours}
                    onChange={(e) =>
                      setFormData({ ...formData, delivery_hours: e.target.value })
                    }
                    placeholder="8AM - 4PM, Mon-Fri"
                  />
                </div>

                <div>
                  <Label>Notes</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Create Supplier</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Suppliers Table */}
      {suppliers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <Building2 className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
          <p className="text-zinc-400">
            No suppliers yet. Add your first supplier to start ordering materials.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>Lead Time</TableHead>
                <TableHead>Delivery Hours</TableHead>
                <TableHead>POs</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-zinc-400" />
                      {supplier.lead_time_days || 2} days
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {supplier.delivery_hours || "—"}
                  </TableCell>
                  <TableCell>
                    <Link 
                      href={`/supplier-hub/purchase-orders?supplier_id=${supplier.id}`}
                      className="text-blue-400 hover:underline"
                    >
                      {supplier.po_count || 0} POs
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      ⭐ {supplier.rating?.toFixed(1) || "5.0"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/supplier-hub/purchase-orders/create?supplier_id=${supplier.id}`}>
                      <Button size="sm" variant="outline">
                        Create PO
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

























