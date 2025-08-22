import { getSupabaseServer } from "@/lib/supabase/server";
import DeliverabilityWizard from "@/components/DeliverabilityWizard";

export default async function DeliverabilityPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const defaultDomain = user?.email?.split("@")[1] || "";
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Deliverability</h1>
      <p className="mt-1 text-sm text-gray-600">Check SPF/DKIM/DMARC and send a test to validate inboxing.</p>
      <div className="mt-5">
        <DeliverabilityWizard defaultDomain={defaultDomain} />
      </div>
    </div>
  );
}

