import { supabaseAdmin } from "@/server/supabase";

export interface ExperimentStats {
  experiment_name: string;
  variant: string;
  viewed: number;
  clicked: number;
  converted: number;
  conversion_rate: number;
  click_through_rate: number;
}

export async function getExperimentStats(experimentName: string): Promise<ExperimentStats[]> {
  const { data: experiment } = await supabaseAdmin
    .from("experiments")
    .select("id, name, variants")
    .eq("name", experimentName)
    .single();

  if (!experiment) {
    throw new Error(`Experiment ${experimentName} not found`);
  }

  const variants = experiment.variants as Array<{ key: string; weight: number }>;
  const stats: ExperimentStats[] = [];

  for (const variant of variants) {
    // Get counts for each event type
    const { count: viewed } = await supabaseAdmin
      .from("experiment_events")
      .select("*", { count: "exact", head: true })
      .eq("experiment_id", experiment.id)
      .eq("variant", variant.key)
      .eq("event", "viewed_banner");

    const { count: clicked } = await supabaseAdmin
      .from("experiment_events")
      .select("*", { count: "exact", head: true })
      .eq("experiment_id", experiment.id)
      .eq("variant", variant.key)
      .eq("event", "clicked_cta");

    const { count: converted } = await supabaseAdmin
      .from("experiment_events")
      .select("*", { count: "exact", head: true })
      .eq("experiment_id", experiment.id)
      .eq("variant", variant.key)
      .eq("event", "converted");

    const viewedCount = viewed || 0;
    const clickedCount = clicked || 0;
    const convertedCount = converted || 0;

    stats.push({
      experiment_name: experiment.name,
      variant: variant.key,
      viewed: viewedCount,
      clicked: clickedCount,
      converted: convertedCount,
      conversion_rate: viewedCount > 0 ? (convertedCount / viewedCount) * 100 : 0,
      click_through_rate: viewedCount > 0 ? (clickedCount / viewedCount) * 100 : 0,
    });
  }

  return stats;
}

export async function getWeeklyExperimentReport(): Promise<string> {
  const { data: experiments } = await supabaseAdmin
    .from("experiments")
    .select("name");

  if (!experiments || experiments.length === 0) {
    return "No active experiments found.";
  }

  let report = "📊 A/B Testing Weekly Report\n\n";

  for (const exp of experiments) {
    try {
      const stats = await getExperimentStats(exp.name);
      report += `**${exp.name}**\n`;
      
      for (const stat of stats) {
        report += `  Variant ${stat.variant}:\n`;
        report += `    Views: ${stat.viewed}\n`;
        report += `    Clicks: ${stat.clicked}\n`;
        report += `    Conversions: ${stat.converted}\n`;
        report += `    CTR: ${stat.click_through_rate.toFixed(2)}%\n`;
        report += `    Conversion Rate: ${stat.conversion_rate.toFixed(2)}%\n\n`;
      }

      // Find winner
      const winner = stats.reduce((prev, current) => 
        current.conversion_rate > prev.conversion_rate ? current : prev
      );
      
      if (stats.length > 1) {
        report += `🏆 Winner: Variant ${winner.variant} (${winner.conversion_rate.toFixed(2)}% conversion)\n\n`;
      }
    } catch (error) {
      report += `❌ Error getting stats for ${exp.name}: ${error}\n\n`;
    }
  }

  return report;
} 