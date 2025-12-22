// Block 92000 — SmartSend Roofing Service Ticket Detail Page v1

import { getServerSupabase } from "@/lib/supabase/server";
import { ServiceTicketDetailView } from "./components/ServiceTicketDetailView";

export default async function ServiceTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-red-500">Unauthorized</p>
      </div>
    );
  }

  return <ServiceTicketDetailView ticketId={id} />;
}



























