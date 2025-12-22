"use client";

import { useEffect, useState } from "react";

interface ActivationScript {
  id: string;
  script_type: string;
  script_key: string;
  title: string;
  script_content: string;
  why_it_helps: string | null;
  display_order: number;
}

interface ActivationScriptsViewerProps {
  scriptType?: string;
  showWhyItHelps?: boolean;
}

/**
 * Component to display activation scripts for onboarding calls
 * 
 * Usage:
 * - Display all scripts: <ActivationScriptsViewer />
 * - Display call parts only: <ActivationScriptsViewer scriptType="call_part" />
 * - Display follow-ups: <ActivationScriptsViewer scriptType="followup_script" />
 */
export function ActivationScriptsViewer({
  scriptType,
  showWhyItHelps = true,
}: ActivationScriptsViewerProps) {
  const [scripts, setScripts] = useState<ActivationScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScripts = async () => {
      try {
        setLoading(true);
        const url = scriptType
          ? `/api/activation/scripts?type=${scriptType}`
          : `/api/activation/scripts`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to fetch activation scripts");
        }

        const data = await response.json();
        setScripts(data.scripts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchScripts();
  }, [scriptType]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">Loading scripts...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">Error: {error}</div>
    );
  }

  if (scripts.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">No scripts found.</div>
    );
  }

  return (
    <div className="space-y-6">
      {scripts.map((script) => (
        <div
          key={script.id}
          className="border rounded-lg p-6 bg-white shadow-sm"
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              {script.title}
            </h3>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
              {script.script_type}
            </span>
          </div>

          <div className="prose max-w-none mb-4">
            <div className="whitespace-pre-wrap text-gray-700">
              {script.script_content}
            </div>
          </div>

          {showWhyItHelps && script.why_it_helps && (
            <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
              <p className="text-sm font-medium text-blue-900 mb-1">
                Why this helps roofers:
              </p>
              <p className="text-sm text-blue-800">{script.why_it_helps}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Compact checklist viewer for activation win checklist
 */
export function ActivationChecklistViewer() {
  const [checklist, setChecklist] = useState<ActivationScript | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChecklist = async () => {
      try {
        const response = await fetch(
          "/api/activation/scripts?key=activation_win_checklist"
        );
        if (response.ok) {
          const data = await response.json();
          if (data.scripts && data.scripts.length > 0) {
            setChecklist(data.scripts[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch checklist:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChecklist();
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading checklist...</div>;
  }

  if (!checklist) {
    return null;
  }

  const items = checklist.script_content
    .split("\n")
    .filter((line) => line.trim().startsWith("✓"))
    .map((line) => line.trim().replace(/^✓\s*/, ""));

  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="font-semibold mb-3">{checklist.title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">✓</span>
            <span className="text-sm text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
      {checklist.why_it_helps && (
        <p className="mt-3 text-xs text-gray-500 italic">
          {checklist.why_it_helps}
        </p>
      )}
    </div>
  );
}






































