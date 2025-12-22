import { redirect } from "next/navigation";
import { requireProOrRedirect } from "@/lib/subscription";
import DeliverabilitySettingsClient from "./DeliverabilitySettingsClient";

export default async function DeliverabilitySettingsPage() {
  const gate = await requireProOrRedirect();
  if (!gate.ok) redirect(gate.redirect);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Deliverability Settings</h1>
        <p className="text-gray-600">
          Configure mailbox rotation, domain throttling, and send windows to optimize email deliverability
        </p>
      </div>
      
      <DeliverabilitySettingsClient />
    </div>
  );
} 