import LeadTable from "./ui/LeadTable";

export default function LeadsPage() {
  const userId = "REPLACE_WITH_AUTHED_USER_ID"; // wire your auth
  return (
    <div className="p-6 grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <a href="/leads/import" className="rounded-xl bg-black text-white px-4 py-2">Import CSV</a>
      </div>
      <LeadTable userId={userId} />
    </div>
  );
}
