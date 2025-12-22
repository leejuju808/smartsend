"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { BookOpen, ChevronRight } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

interface PlaybookSection {
  id: string;
  title: string;
  slug: string;
  orderIndex: number;
}

interface PlaybookStep {
  id: string;
  sectionId: string;
  title: string;
  content: string;
  orderIndex: number;
}

export default function PlaybookPage() {
  const supabase = createClientComponentClient();
  const [sections, setSections] = useState<PlaybookSection[]>([]);
  const [steps, setSteps] = useState<Record<string, PlaybookStep[]>>({});
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlaybook();
  }, []);

  const fetchPlaybook = async () => {
    try {
      // Fetch sections
      const { data: sectionsData, error: sectionsError } = await supabase
        .from("owner_playbook_sections")
        .select("*")
        .order("order_index", { ascending: true });

      if (sectionsError) throw sectionsError;

      setSections(sectionsData || []);

      // Fetch all steps
      const { data: stepsData, error: stepsError } = await supabase
        .from("owner_playbook_steps")
        .select("*")
        .order("order_index", { ascending: true });

      if (stepsError) throw stepsError;

      // Group steps by section
      const stepsBySection: Record<string, PlaybookStep[]> = {};
      (stepsData || []).forEach((step) => {
        if (!stepsBySection[step.section_id]) {
          stepsBySection[step.section_id] = [];
        }
        stepsBySection[step.section_id].push(step);
      });

      setSteps(stepsBySection);

      // Select first section by default
      if (sectionsData && sectionsData.length > 0) {
        setSelectedSection(sectionsData[0].id);
      }
    } catch (error) {
      console.error("Error fetching playbook:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentSteps = selectedSection ? steps[selectedSection] || [] : [];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-6">
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="col-span-3 h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-6 h-6 text-blue-600" />
          <h1 className="text-3xl font-bold">SmartSend Owner Playbook</h1>
        </div>
        <p className="text-gray-600">
          Your complete guide to winning jobs with SmartSend. Learn the method, set up your system, and close more deals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Sections */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sections</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav className="space-y-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${
                      selectedSection === section.id
                        ? "bg-blue-50 text-blue-900 border-l-4 border-blue-600"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{section.title}</span>
                      {selectedSection === section.id && (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Steps */}
        <div className="lg:col-span-3">
          {selectedSection ? (
            <div className="space-y-6">
              {currentSteps.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    No content available for this section.
                  </CardContent>
                </Card>
              ) : (
                currentSteps.map((step, index) => (
                  <Card key={step.id} className="border-l-4 border-l-blue-600">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              Step {index + 1}
                            </span>
                          </div>
                          <CardTitle className="text-xl">{step.title}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                          {step.content.split("\n").map((paragraph, pIndex) => {
                            if (!paragraph.trim()) {
                              return <br key={pIndex} />;
                            }

                            // Detect bullet points
                            if (paragraph.trim().startsWith("•") || paragraph.trim().startsWith("-")) {
                              return (
                                <div key={pIndex} className="flex items-start gap-2 mb-2">
                                  <span className="text-blue-600 mt-1">•</span>
                                  <span>{paragraph.trim().substring(1).trim()}</span>
                                </div>
                              );
                            }

                            // Detect numbered lists
                            const numberedMatch = paragraph.trim().match(/^(\d+)\.\s+(.+)$/);
                            if (numberedMatch) {
                              return (
                                <div key={pIndex} className="flex items-start gap-2 mb-2">
                                  <span className="font-semibold text-blue-600 mt-1">
                                    {numberedMatch[1]}.
                                  </span>
                                  <span>{numberedMatch[2]}</span>
                                </div>
                              );
                            }

                            // Regular paragraph
                            return (
                              <p key={pIndex} className="mb-4">
                                {paragraph}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                Select a section to view content.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


























