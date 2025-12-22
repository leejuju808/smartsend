// Block 41700 — SmartSend Roofing Material Ordering Engine v1
// Supplier Management Page
// Manage suppliers (Beacon, ABC, SRS, local yards)

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import React from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SuppliersPage() {
  const router = useRouter();
  const supabase = createClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    delivery_cutoff: "",
    delivery_instructions: "",
    account_number: "",
    notes: "",
  });

  // Get workspace_id from user session
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  React.useEffect(() => {
    async function getWorkspace() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: member } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .single();
        if (member) {
          setWorkspaceId(member.workspace_id);
        }
      }
    }
    getWorkspace();
  }, [supabase]);

  const { data, error, mutate } = useSWR<{ suppliers: any[] }>(
    workspaceId ? `/api/suppliers?workspace_id=${workspaceId}` : null,
    fetcher
  );

  const suppliers = data?.suppliers || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) {
      alert("Workspace not found");
      return;
    }

    try {
      const url = editingSupplier
        ? `/api/suppliers/${editingSupplier.id}`
        : "/api/suppliers";
      const method = editingSupplier ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          workspace_id: workspaceId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save supplier");
      }

      mutate();
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Error saving supplier:", error);
      alert(error.message || "Failed to save supplier");
    }
  };

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      delivery_cutoff: supplier.delivery_cutoff || "",
      delivery_instructions: supplier.delivery_instructions || "",
      account_number: supplier.account_number || "",
      notes: supplier.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (supplierId: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete supplier");
      }

      mutate();
    } catch (error: any) {
      console.error("Error deleting supplier:", error);
      alert(error.message || "Failed to delete supplier");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      address: "",
      delivery_cutoff: "",
      delivery_instructions: "",
      account_number: "",
      notes: "",
    });
    setEditingSupplier(null);
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
          <h1 className="text-2xl font-semibold text-zinc-50">Suppliers</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your material suppliers (Beacon, ABC, SRS, local yards)
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? "Edit Supplier" : "Add Supplier"}
              </DialogTitle>
              <DialogDescription>
                {editingSupplier
                  ? "Update supplier information"
                  : "Add a new material supplier to your database"}
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
                    placeholder="Beacon, ABC Supply, etc."
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
                  <Label>Account Number</Label>
                  <Input
                    value={formData.account_number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        account_number: e.target.value,
                      })
                    }
                    placeholder="Your account #"
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
                <Label>Delivery Cutoff</Label>
                <Input
                  value={formData.delivery_cutoff}
                  onChange={(e) =>
                    setFormData({ ...formData, delivery_cutoff: e.target.value })
                  }
                  placeholder="2PM for next day delivery"
                />
              </div>

              <div>
                <Label>Delivery Instructions</Label>
                <Textarea
                  value={formData.delivery_instructions}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      delivery_instructions: e.target.value,
                    })
                  }
                  placeholder="Special delivery instructions..."
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
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
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingSupplier ? "Update" : "Create"} Supplier
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Suppliers List */}
      <div className="grid gap-4">
        {suppliers.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-400">
              No suppliers yet. Add your first supplier to start ordering materials.
            </p>
          </div>
        ) : (
          suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-zinc-50">
                    {supplier.name}
                  </h3>
                  <div className="mt-2 space-y-1 text-sm text-zinc-400">
                    {supplier.email && <div>📧 {supplier.email}</div>}
                    {supplier.phone && <div>📞 {supplier.phone}</div>}
                    {supplier.address && <div>📍 {supplier.address}</div>}
                    {supplier.account_number && (
                      <div>Account #: {supplier.account_number}</div>
                    )}
                    {supplier.delivery_cutoff && (
                      <div>⏰ Cutoff: {supplier.delivery_cutoff}</div>
                    )}
                  </div>
                  {supplier.delivery_instructions && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {supplier.delivery_instructions}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(supplier)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(supplier.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}































