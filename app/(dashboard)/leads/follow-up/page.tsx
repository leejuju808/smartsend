// app/(dashboard)/leads/follow-up/page.tsx
import { FollowUpLeadList } from "./FollowUpLeadList";

export default function FollowUpLeadsPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-50">
            Follow-Up Queue
          </h1>
          <p className="text-sm text-neutral-400">
            Leads that need a follow-up call or email today based on their
            scheduled follow-up time.
          </p>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto">
        <FollowUpLeadList />
      </section>
    </div>
  );
}

























































