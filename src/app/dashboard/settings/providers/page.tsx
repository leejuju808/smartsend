import { redirect } from "next/navigation";
import { requireProOrRedirect } from "@/lib/subscription";
import ProvidersClient from "./ProvidersClient";

export default async function ProvidersPage() {
  const gate = await requireProOrRedirect();
  if (!gate.ok) redirect(gate.redirect);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Email Providers</h1>
        <p className="text-gray-600">
          Manage your email service providers, configure failover settings, and monitor health scores
        </p>
      </div>
      
      <ProvidersClient />
    </div>
  );
} 