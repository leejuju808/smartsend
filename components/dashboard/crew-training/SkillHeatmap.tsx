// Block 67000 — Skill Heatmap Component
// Visual heatmap showing crew skill strengths and weaknesses

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SkillHeatmapProps {
  workspaceId: string;
}

interface CrewSkillData {
  crew_id: string;
  crew_name: string;
  skills: {
    tear_off?: number;
    shingle_installation?: number;
    flashing?: number;
    ventilation?: number;
    ridge?: number;
    cleanup?: number;
    safety?: number;
    time_management?: number;
  };
}

export function SkillHeatmap({ workspaceId }: SkillHeatmapProps) {
  const [data, setData] = useState<CrewSkillData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHeatmapData();
  }, [workspaceId]);

  async function fetchHeatmapData() {
    try {
      const supabase = createClient();
      
      // Get latest skill scores for all crews
      const { data: scores } = await supabase
        .from('crew_skill_scores')
        .select('crew_id, crews(name), tear_off, shingle_installation, flashing, ventilation, ridge, cleanup, safety, time_management')
        .eq('workspace_id', workspaceId)
        .not('crew_id', 'is', null)
        .order('created_at', { ascending: false });

      if (!scores) return;

      // Group by crew and get latest scores
      const crewMap = new Map<string, CrewSkillData>();
      
      scores.forEach((score: any) => {
        if (!score.crew_id) return;
        
        const crewName = score.crews?.name || 'Unknown Crew';
        
        if (!crewMap.has(score.crew_id)) {
          crewMap.set(score.crew_id, {
            crew_id: score.crew_id,
            crew_name: crewName,
            skills: {}
          });
        }
        
        const crew = crewMap.get(score.crew_id)!;
        crew.skills = {
          tear_off: score.tear_off || crew.skills.tear_off,
          shingle_installation: score.shingle_installation || crew.skills.shingle_installation,
          flashing: score.flashing || crew.skills.flashing,
          ventilation: score.ventilation || crew.skills.ventilation,
          ridge: score.ridge || crew.skills.ridge,
          cleanup: score.cleanup || crew.skills.cleanup,
          safety: score.safety || crew.skills.safety,
          time_management: score.time_management || crew.skills.time_management
        };
      });

      setData(Array.from(crewMap.values()));
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getColorClass(score: number | undefined): string {
    if (!score) return 'bg-slate-100 text-slate-400';
    if (score >= 80) return 'bg-green-500 text-white';
    if (score >= 70) return 'bg-green-300 text-green-900';
    if (score >= 60) return 'bg-yellow-300 text-yellow-900';
    if (score >= 50) return 'bg-orange-300 text-orange-900';
    return 'bg-red-400 text-white';
  }

  const skillLabels = {
    tear_off: 'Tear-Off',
    shingle_installation: 'Shingles',
    flashing: 'Flashing',
    ventilation: 'Ventilation',
    ridge: 'Ridge',
    cleanup: 'Cleanup',
    safety: 'Safety',
    time_management: 'Time Mgmt'
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading heatmap data...</div>;
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No skill data available. Run performance analysis for your crews to generate the heatmap.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left p-3 font-semibold text-slate-700 sticky left-0 bg-white z-10">
                Crew
              </th>
              {Object.entries(skillLabels).map(([key, label]) => (
                <th key={key} className="text-center p-3 font-semibold text-slate-700 min-w-[100px]">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((crew) => (
              <tr key={crew.crew_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-medium text-slate-900 sticky left-0 bg-white z-10">
                  {crew.crew_name}
                </td>
                {Object.keys(skillLabels).map((skillKey) => {
                  const score = crew.skills[skillKey as keyof typeof crew.skills];
                  return (
                    <td key={skillKey} className="p-3 text-center">
                      <div
                        className={`inline-block px-3 py-1 rounded-md font-medium text-sm ${getColorClass(score)}`}
                        title={`${skillLabels[skillKey as keyof typeof skillLabels]}: ${score || 'N/A'}/100`}
                      >
                        {score !== undefined ? score : '—'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>80-100 (Excellent)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-300 rounded"></div>
          <span>70-79 (Good)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-300 rounded"></div>
          <span>60-69 (Fair)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-300 rounded"></div>
          <span>50-59 (Needs Work)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-400 rounded"></div>
          <span>&lt;50 (Critical)</span>
        </div>
      </div>
    </div>
  );
}




























