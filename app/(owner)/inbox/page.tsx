import InboxPage from "@/app/dashboard/inbox/page";

export default function InboxStandalonePage() {
  return (
    <div className="space-y-2 h-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">
            Inbox Command Center
          </h1>
          <p className="text-[11px] text-slate-500">
            Every homeowner reply, classified and turned into tasks.
          </p>
        </div>
        <span className="text-[10px] text-slate-400">
          Reply · Intent · Follow-up
        </span>
      </div>
      <div className="h-[calc(100vh-8rem)]">
        <InboxPage />
      </div>
    </div>
  );
}














































