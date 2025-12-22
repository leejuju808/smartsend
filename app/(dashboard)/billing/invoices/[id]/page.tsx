// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Invoice Detail Page

import { getServerSupabase } from "@/src/lib/supabase/server";
import { InvoiceDetailClient } from "./components/InvoiceDetailClient";
import { notFound } from "next/navigation";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Unauthorized</div>;
  }

  // Get invoice with all related data
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_line_items (*),
      jobs:job_id (
        id,
        lead_id,
        leads:lead_id (
          id,
          email,
          first_name,
          last_name,
          phone
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error || !invoice) {
    notFound();
  }

  // Get transactions
  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      *,
      payment_methods:method_id (
        id,
        type,
        last4,
        brand,
        bank_name
      )
    `)
    .eq("invoice_id", id)
    .order("created_at", { ascending: false });

  // Get payment reminders
  const { data: reminders } = await supabase
    .from("payment_reminders")
    .select("*")
    .eq("invoice_id", id)
    .order("sent_at", { ascending: false });

  // Get QuickBooks sync status
  const { data: qbSync } = await supabase
    .from("quickbooks_sync")
    .select("*")
    .eq("invoice_id", id)
    .maybeSingle();

  // Get auto-pay rules
  const { data: autopayRules } = await supabase
    .from("auto_pay_rules")
    .select(`
      *,
      payment_methods:method_id (
        id,
        type,
        last4,
        brand
      )
    `)
    .eq("invoice_id", id)
    .eq("status", "active");

  return (
    <InvoiceDetailClient
      invoice={invoice}
      transactions={transactions || []}
      reminders={reminders || []}
      qbSync={qbSync}
      autopayRules={autopayRules || []}
    />
  );
}

























