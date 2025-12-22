import { HotLeadList } from "./HotLeadList";
import Link from "next/link";

export default function HotLeadsPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-50">
            Hot Lead Inbox
          </h1>
          <p className="text-sm text-neutral-400">
            All homeowners who replied with strong interest, sorted by most
            recent. These are the leads to call first.
          </p>
        </div>
        <Link
          href="/followups"
          className="text-[0.7rem] text-emerald-400 hover:underline"
        >
          View Follow-Up Board
        </Link>
      </header>
      <section className="flex-1 overflow-y-auto">
        <HotLeadList />
      </section>
    </div>
  );
}

