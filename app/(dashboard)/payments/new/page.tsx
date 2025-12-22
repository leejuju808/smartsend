import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { CreateInvoiceForm } from "./components/CreateInvoiceForm";

export default async function CreateInvoicePage() {
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
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-50">Create Invoice</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Create a new invoice with line items and payment link
        </p>
      </div>
      <CreateInvoiceForm orgId={orgId} />
    </div>
  );
}



























