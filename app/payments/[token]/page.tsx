import { getServerSupabase } from "@/src/lib/supabase/server";
import { HomeownerPaymentPortal } from "./components/HomeownerPaymentPortal";

export default async function HomeownerPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await getServerSupabase();

  // Get invoice by payment link token (we'll need to add token field to payment_links)
  // For now, let's use a simple lookup - in production, use a secure token
  const { data: paymentLink } = await supabase
    .from("payment_links")
    .select("*, invoices(*)")
    .eq("id", token)
    .eq("is_active", true)
    .single();

  if (!paymentLink || !paymentLink.invoices) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Link Not Found
          </h1>
          <p className="text-gray-600">
            This payment link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  const invoice = paymentLink.invoices as any;

  return (
    <div className="min-h-screen bg-gray-50">
      <HomeownerPaymentPortal
        invoice={invoice}
        paymentLink={paymentLink}
        token={token}
      />
    </div>
  );
}



























