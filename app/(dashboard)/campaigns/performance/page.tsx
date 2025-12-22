import { CampaignPerformanceTable } from "./CampaignPerformanceTable";
import Link from "next/link";

export default function CampaignPerformancePage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-50">
            Campaign Performance
          </h1>
          <p className="text-sm text-neutral-400">
            See which SmartSend campaigns are generating replies, hot leads, and
            pipeline value.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link
            href="/campaigns/new"
            className="rounded-xl bg-neutral-100 px-3 py-2 font-semibold text-neutral-900"
          >
            New Campaign
          </Link>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto">
        <CampaignPerformanceTable />
      </section>
    </div>
  );
}

























































