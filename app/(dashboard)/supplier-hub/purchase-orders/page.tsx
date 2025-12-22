// Block 241000 — SmartSend Roofing Supplier Hub v1
// Purchase Orders List Page

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, FileText, Send, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PurchaseOrdersPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);

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

  const { data, error } = useSWR<{ purchase_orders: any[] }>(
    companyId ? `/api/supplier/po?company_id=${companyId}` : null,
    fetcher
  );

  const pos = data?.purchase_orders || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: "outline",
      sent: "default",
      confirmed: "default",
      delivered: "default",
      verified: "default",
      cancelled: "secondary",
    };
    return (
      <Badge variant={variants[status] as any || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Purchase Orders</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Track and manage all material purchase orders
          </p>
        </div>
        <Link href="/supplier-hub/purchase-orders/create">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create PO
          </Button>
        </Link>
      </div>

      {pos.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
          <p className="text-zinc-400 mb-4">
            No purchase orders yet. Create your first PO to get started.
          </p>
          <Link href="/supplier-hub/purchase-orders/create">
            <Button>Create Purchase Order</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Delivery Date</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pos.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono font-medium">{po.po_number}</TableCell>
                  <TableCell>{po.suppliers?.name || "—"}</TableCell>
                  <TableCell>
                    {po.jobs?.address || "—"}
                  </TableCell>
                  <TableCell>{po.delivery_date || "—"}</TableCell>
                  <TableCell>${po.total_cost?.toFixed(2) || "0.00"}</TableCell>
                  <TableCell>{getStatusBadge(po.status)}</TableCell>
                  <TableCell>
                    <Link href={`/supplier-hub/purchase-orders/${po.id}`}>
                      <Button size="sm" variant="outline">
                        View
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

























