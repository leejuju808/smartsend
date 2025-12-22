/**
 * Block 23690 — Billing Update Page
 * Handles billing update link redirects
 */

import { redirect } from "next/navigation";

export default async function BillingUpdatePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;

  if (!token) {
    redirect("/settings?section=billing&error=missing_token");
  }

  // Redirect to API endpoint which will handle Stripe Customer Portal
  redirect(`/api/billing/update-link?token=${token}`);
}






































