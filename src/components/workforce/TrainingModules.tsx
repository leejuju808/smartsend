"use client";

import { useState, useEffect } from "react";
import { Plus, Play, CheckCircle, Clock } from "lucide-react";
import { WorkforceTrainingModule } from "@/types/database";

export function TrainingModules() {
  const [modules, setModules] = useState<WorkforceTrainingModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModules();
  }, []);

  async function fetchModules() {
    try {
      const res = await fetch("/api/workforce/training/modules");
      const data = await res.json();
      setModules(data.modules || []);
    } catch (error) {
      console.error("Error fetching modules:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading training modules...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Training Modules</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Add Module
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            No training modules yet. Add your first module to get started.
          </div>
        ) : (
          modules.map((module) => (
            <div
              key={module.id}
              className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-lg">{module.title}</h3>
                {module.content_type === "video" && (
                  <Play className="h-5 w-5 text-blue-500" />
                )}
              </div>
              {module.description && (
                <p className="text-sm text-gray-600 mb-4">{module.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {module.required_for_role && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                    Required: {module.required_for_role}
                  </span>
                )}
                {module.estimated_duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {module.estimated_duration_minutes} min
                  </span>
                )}
              </div>
              <div className="mt-4">
                <a
                  href={module.content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View Content →
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
























