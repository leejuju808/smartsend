"use client";

import { useEffect, useState } from "react";
import { Button } from "@aurev/ui";

interface CaseStudy {
  id: string;
  org_name: string;
  description: string | null;
  results: any;
  logo_url: string | null;
  published: boolean;
}

export default function CaseStudiesPage() {
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCaseStudies() {
      try {
        const res = await fetch("/api/case-studies");
        if (res.ok) {
          const data = await res.json();
          setCaseStudies(data.case_studies || []);
        }
      } catch (error) {
        console.error("Failed to fetch case studies:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCaseStudies();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading case studies...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">Customer Success Stories</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          See how teams use AUREV OS to transform their outreach, operations, and automation.
        </p>
      </div>

      {caseStudies.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-gray-500 mb-4">No case studies published yet.</p>
          <Button onClick={() => window.location.href = "/enterprise"}>
            See Our Enterprise Plans
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {caseStudies.map((study) => (
            <div
              key={study.id}
              className="bg-surface border border-gray-800 rounded-xl p-6 space-y-4 hover:border-amber-400 transition-colors"
            >
              {study.logo_url && (
                <div className="relative h-12 w-32 mb-4">
                  <img
                    src={study.logo_url}
                    alt={study.org_name}
                    className="object-contain h-full w-full"
                  />
                </div>
              )}
              <h3 className="text-xl font-semibold text-white">{study.org_name}</h3>
              {study.description && (
                <p className="text-gray-400 text-sm">{study.description}</p>
              )}
              {study.results && typeof study.results === "object" && (
                <div className="pt-4 border-t border-gray-800">
                  <h4 className="text-sm font-semibold text-amber-400 mb-2">Results</h4>
                  <ul className="text-xs text-gray-400 space-y-1">
                    {Object.entries(study.results).map(([key, value]) => (
                      <li key={key}>
                        <span className="text-gray-500">{key}:</span>{" "}
                        <span className="text-white">{String(value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

