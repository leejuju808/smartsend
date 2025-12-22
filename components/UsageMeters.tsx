import { getPlanStateWithUsage } from "@/lib/planLimits";
import { getTrialState } from "@/lib/trial";
import UsageMeter from "./UsageMeter";

export default async function UsageMeters() {
  const planState = await getPlanStateWithUsage();
  const trial = await getTrialState();

  return (
    <>
      {/* TRIAL BANNER IF ACTIVE */}
      {trial?.isActive && (
        <div className="mb-4 rounded-xl border border-blue-500 bg-blue-500/10 px-4 py-3 text-xs text-blue-700 shadow-sm">
          {trial.daysLeft} days left in your free trial.
        </div>
      )}

      {/* USAGE METERS */}
      {planState?.usage && (
        <>
          <UsageMeter
            label="Campaigns"
            used={planState.usage.campaign.used}
            max={planState.usage.campaign.max}
            percent={planState.usage.campaign.percent}
          />

          <UsageMeter
            label="Emails this month"
            used={planState.usage.email.used}
            max={planState.usage.email.max}
            percent={planState.usage.email.percent}
          />
        </>
      )}
    </>
  );
}


























































