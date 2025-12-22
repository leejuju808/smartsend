import CSVImportModal from "@/components/CSVImportModal";
import LeadsTableV2 from "@/components/LeadsTableV2";

export default function LeadsImportDashboardPage() {
  const workspaceId = "REPLACE_WITH_WORKSPACE_ID";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads (Import Dashboard)</h1>
        <CSVImportModal workspaceId={workspaceId} />
      </div>
      <LeadsTableV2 />
    </div>
  );
}


