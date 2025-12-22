// Block 241000 — SmartSend Roofing Supplier Hub v1
// PO Detail View

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send, CheckCircle, Package, FileText, ArrowLeft, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PODetailPage({ params }: { params: Promise<{ po_id: string }> }) {
  const router = useRouter();
  const [poId, setPoId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    params.then((p) => setPoId(p.po_id));
  }, [params]);

  const { data, error, mutate } = useSWR<{ po: any }>(
    poId ? `/api/supplier/po/${poId}` : null,
    fetcher
  );

  const po = data?.po;

  const handleSend = async () => {
    if (!poId) return;
    setSending(true);
    try {
      const response = await fetch("/api/supplier/po/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ po_id: poId }),
      });

      if (!response.ok) {
        throw new Error("Failed to send PO");
      }

      mutate();
    } catch (error: any) {
      alert(error.message || "Failed to send PO");
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return <div className="p-6">Error loading PO</div>;
  }

  if (!po) {
    return <div className="p-6">Loading...</div>;
  }

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant={status === "verified" ? "default" : "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/supplier-hub/purchase-orders">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-zinc-50">
            {po.po_number}
          </h1>
          <p className="text-sm text-zinc-400">
            {po.suppliers?.name || "Supplier"}
          </p>
        </div>
        {po.status === "pending" && (
          <Button onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send to Supplier"}
          </Button>
        )}
        {po.pdf_url && (
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-sm text-zinc-400">Status</div>
          <div className="mt-1">{getStatusBadge(po.status)}</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-sm text-zinc-400">Total Cost</div>
          <div className="mt-1 text-xl font-semibold">
            ${po.total_cost?.toFixed(2) || "0.00"}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-sm text-zinc-400">Delivery Date</div>
          <div className="mt-1">{po.delivery_date || "Not set"}</div>
        </div>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.po_items?.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.material_name}</TableCell>
                    <TableCell>{item.qty}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>${item.price?.toFixed(2)}</TableCell>
                    <TableCell className="font-medium">
                      ${item.total_price?.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="delivery">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            {po.deliveries && po.deliveries.length > 0 ? (
              <div className="space-y-4">
                {po.deliveries.map((delivery: any) => (
                  <div key={delivery.id} className="border-b border-zinc-800 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          Delivered: {new Date(delivery.delivered_at).toLocaleString()}
                        </div>
                        {delivery.delivered_by && (
                          <div className="text-sm text-zinc-400">
                            By: {delivery.delivered_by}
                          </div>
                        )}
                        {delivery.notes && (
                          <div className="text-sm text-zinc-400 mt-2">
                            {delivery.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-zinc-400 py-8">
                No delivery information yet
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="verification">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            {po.material_verification && po.material_verification.length > 0 ? (
              po.material_verification.map((verification: any) => (
                <div key={verification.id}>
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="font-medium">
                      {verification.verified ? "Verified" : "Not Verified"}
                    </span>
                  </div>
                  {verification.discrepancies && 
                   JSON.parse(verification.discrepancies || "[]").length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Discrepancies:</div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-zinc-400">
                        {JSON.parse(verification.discrepancies).map((d: any, i: number) => (
                          <li key={i}>
                            {d.item}: Expected {d.expected}, Received {d.received}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center text-zinc-400 py-8">
                No verification yet. Crew should verify upon delivery.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            {po.supplier_invoices && po.supplier_invoices.length > 0 ? (
              <div className="space-y-4">
                {po.supplier_invoices.map((invoice: any) => (
                  <div key={invoice.id} className="border-b border-zinc-800 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          Invoice #{invoice.invoice_number || "N/A"}
                        </div>
                        <div className="text-sm text-zinc-400">
                          Amount: ${invoice.amount?.toFixed(2)}
                        </div>
                        {invoice.variance && (
                          <div className="text-sm mt-2">
                            Variance: ${invoice.variance?.toFixed(2)} (
                            {invoice.variance_percent?.toFixed(2)}%)
                          </div>
                        )}
                      </div>
                      {invoice.reconciled && (
                        <Badge variant="default">Reconciled</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-zinc-400 py-8">
                No invoices uploaded yet
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

























