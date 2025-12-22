import SuppressionManager from "./SuppressionManager";
import MailboxStatus from "./MailboxStatus";
import { DeliverabilityPanel } from "@/components/deliverability/panel";
import DeliverabilityShieldPanel from "@/components/deliverability/DeliverabilityShieldPanel";
import DeliverabilityShieldDashboard from "./DeliverabilityShieldDashboard";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export default async function DeliverabilitySettings() {
  const workspaceId = await getCurrentWorkspaceId();

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Block 14900 - Deliverability Shield v1 Dashboard */}
      <div>
        <DeliverabilityShieldDashboard />
      </div>
      
      {/* Legacy Components */}
      <div>
        <h1 className="text-2xl font-bold mb-4">Deliverability Shield</h1>
        <DeliverabilityShieldPanel />
      </div>
      <div>
        <h1 className="text-2xl font-bold mb-4">Deliverability Diagnostics</h1>
        {workspaceId ? (
          <DeliverabilityPanel workspaceId={workspaceId} />
        ) : (
          <div className="text-muted-foreground p-4">
            Please select a workspace to view deliverability diagnostics.
          </div>
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-4">Mailbox Status</h2>
        <MailboxStatus />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-4">Suppression Management</h2>
        <SuppressionManager />
      </div>
    </div>
  );
}

