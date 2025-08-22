import Link from "next/link";

export default function CampaignsIndex() {
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Link href="/dashboard/campaigns/new" className="rounded-2xl bg-black px-4 py-2 text-white">New campaign</Link>
      </div>
      {/* Optionally: list campaigns via client fetch to /api/campaigns */}
    </div>
  );
}

