import { MultiBranchDashboard } from "@/components/dashboard/MultiBranchDashboard";
import { OwnerHQCommandBoard } from "@/components/dashboard/OwnerHQCommandBoard";
import { EnterpriseAlertsPanel } from "@/components/dashboard/EnterpriseAlertsPanel";
import { BranchPerformanceReports } from "@/components/dashboard/BranchPerformanceReports";

export default function EnterpriseCommandCenterPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Enterprise Command Center</h1>
        <p className="text-sm text-gray-400">
          Complete operational overview for multi-branch roofing companies
        </p>
      </div>

      {/* Owner HQ Command Board */}
      <OwnerHQCommandBoard />

      {/* Multi-Branch Dashboard */}
      <MultiBranchDashboard />

      {/* Enterprise Alerts */}
      <EnterpriseAlertsPanel />

      {/* Branch Performance Reports */}
      <BranchPerformanceReports />
    </div>
  );
}






















