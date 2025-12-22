// Block 254700 — SmartSend Billing & Collections Engine v1
// Customer Payment Portal

import { getServerSupabase } from "@/src/lib/supabase/server";
import { CustomerPaymentPortalClient } from "./CustomerPaymentPortalClient";

export default async function CustomerPaymentPortalPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = await getServerSupabase();

  // Get invoice by payment link token (you'll need to add this field to invoices table)
  // For now, we'll use a simple lookup - you may want to create a separate table for portal tokens
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("payment_link", params.token)
    .single();

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Invoice Not Found</h1>
          <p className="text-gray-600">
            This payment link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  // Get payments for this invoice
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("date", { ascending: false });

  return (
    <CustomerPaymentPortalClient
      invoice={invoice}
      payments={payments || []}
    />
  );
}






















