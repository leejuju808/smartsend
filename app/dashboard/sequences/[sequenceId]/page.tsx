import { createClient } from "@/lib/supabase/server";
import { SequenceSdrTuner } from "@/components/sequences/SequenceSdrTuner";
import { getCurrentOrgId } from "@/lib/org-helpers";

export default async function SequencePage({
  params,
}: {
  params: Promise<{ sequenceId: string }>;
}) {
  const supabase = createClient();
  const { sequenceId } = await params;

  // Get org_id from session/cookie
  const orgId = await getCurrentOrgId();
  
  if (!orgId) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          Please select an organization to view sequence settings.
        </p>
      </div>
    );
  }

  // Load sequence, global settings, and override in parallel
  const [{ data: sequence }, { data: globalSettings }, { data: override }] =
    await Promise.all([
      supabase
        .from("sequences")
        .select("*")
        .eq("id", sequenceId)
        .maybeSingle(),
      supabase
        .from("sdr_settings")
        .select("*")
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("sdr_sequence_overrides")
        .select("*")
        .eq("org_id", orgId)
        .eq("sequence_id", sequenceId)
        .maybeSingle(),
    ]);

  if (!sequence) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Sequence not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{sequence.name}</h1>
        <p className="text-sm text-muted-foreground">
          Sequence ID: {sequenceId}
        </p>
      </div>

      <SequenceSdrTuner
        orgId={orgId}
        sequenceId={sequenceId}
        globalSettings={globalSettings}
        override={override}
      />
    </div>
  );
}

