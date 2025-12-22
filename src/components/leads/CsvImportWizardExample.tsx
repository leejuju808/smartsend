// Example usage of CsvImportWizard component
import { useState } from "react";
import { CsvImportWizard } from "@/components/leads/CsvImportWizard";

function CampaignLeadsPage({ campaignId, userId }: { campaignId: string; userId: string }) {
  const [showImportWizard, setShowImportWizard] = useState(false);

  const handleImportComplete = (result: { imported: number; skipped: number; invalid: number; total: number }) => {
    console.log(`Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.invalid} invalid`);
    setShowImportWizard(false);
    // Refresh leads list or show success message
  };

  return (
    <div>
      <button 
        onClick={() => setShowImportWizard(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Import Leads
      </button>

      {showImportWizard && (
        <CsvImportWizard
          campaignId={campaignId}
          userId={userId}
          onClose={() => setShowImportWizard(false)}
          onImportComplete={handleImportComplete}
        />
      )}
    </div>
  );
}