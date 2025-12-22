// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Payment Plan Manager Page

import { getServerSupabase } from "@/src/lib/supabase/server";
import { PaymentPlanManagerClient } from "./components/PaymentPlanManagerClient";
import { notFound } from "next/navigation";

export default async function PaymentPlanManagerPage({
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

  // Get payment plan
  const { data: plan, error } = await supabase
    .from("payment_plans")
    .select(`
      *,
      homeowners:homeowner_id (
        id,
        email,
        name
      ),
      jobs:job_id (
        id,
        title
      )
    `)
    .eq("id", id)
    .single();

  if (error || !plan) {
    notFound();
  }

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
    .eq("payment_plan_id", id);

  return (
    <PaymentPlanManagerClient
      plan={plan}
      autopayRules={autopayRules || []}
    />
  );
}

























