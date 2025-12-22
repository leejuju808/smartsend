import { createClient } from "@/utils/supabase/server";
import { SequenceSdrBoard } from "./SequenceSdrBoard";

export default async function SdrSequencesPage() {
  const supabase = createClient();

  const [{ data: metrics }, { data: sequences }] = await Promise.all([
    supabase
      .from("sequence_ai_sdr_metrics")
      .select("*"),
    supabase
      .from("sequences")
      .select("id, name, status")
  ]);

  const seqById = new Map(
    (sequences ?? []).map((s) => [s.id, s]),
  );

  const rows = (metrics ?? []).map((m) => {
    const seq = seqById.get(m.sequence_id);
    return {
      ...m,
      sequence_name: seq?.name || "(Unnamed sequence)",
      sequence_status: seq?.status || "active",
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Sequence AI SDR Performance
          </h1>
          <p className="text-xs text-muted-foreground">
            Compare how each sequence performs with AI SDR vs normal sends.
          </p>
        </div>
      </div>

      <SequenceSdrBoard rows={rows} />
    </div>
  );
}

