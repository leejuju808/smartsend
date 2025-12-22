import { CsvImport } from "@/components/leads/CsvImport";

export default function LeadImportPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Import Leads</h1>
      <CsvImport campaignId={params.id} />
    </div>
  );
}

