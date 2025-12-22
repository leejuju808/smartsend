import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { PaymentsDashboard } from "./components/PaymentsDashboard";

export default async function PaymentsPage() {
  const supabase = await getServerSupabase();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Could not determine organization. Please sign in again.
      </div>
    );
  }

  return (
    <div className="p-4">
      <PaymentsDashboard orgId={orgId} />
    </div>
  );
}



























