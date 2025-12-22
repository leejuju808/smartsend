import { redirect } from "next/navigation";
import { getUserWithSubscription } from "@/lib/getUserWithSubscription";
import PipelineClient from "./PipelineClient";

export default async function PipelinePage() {
  const { user } = await getUserWithSubscription();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Jobs Pipeline</h1>
        <p className="text-gray-600">Hot → Booked → Closed. One way to run production.</p>
      </div>

      <PipelineClient />
    </div>
  );
}

