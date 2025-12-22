import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { fetchTodayActionList } from "./_lib/fetchTodayActionList";
import { TodayActionListClient } from "./components/TodayActionListClient";

export default async function TodayPage() {
  const supabase = await getServerSupabase();
  const orgId = await getCurrentOrgId();

  if (!orgId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Missing organization. Please contact support.
      </div>
    );
  }

  const list = await fetchTodayActionList(supabase, orgId);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-base font-semibold text-zinc-50">Today</h1>
        <p className="mt-1 text-sm text-zinc-400">
          SmartSend picked the homeowners you should focus on today to book more
          roofing jobs with less guesswork.
        </p>
      </div>

      <TodayActionListClient orgId={orgId} initialList={list} />
    </div>
  );
}

