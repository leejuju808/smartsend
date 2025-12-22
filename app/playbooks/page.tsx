"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Playbook {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  config: any;
  is_global: boolean;
}

export default function PlaybooksPage() {
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  const fetchPlaybooks = async () => {
    try {
      const res = await fetch("/api/playbooks");
      const data = await res.json();
      if (data.playbooks) {
        setPlaybooks(data.playbooks);
      }
    } catch (error) {
      console.error("Error fetching playbooks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUsePlaybook = (playbook: Playbook) => {
    setSelectedPlaybook(playbook);
  };

  const handleInstantiate = async (playbook: Playbook) => {
    const campaignName = prompt(
      `Enter a name for your campaign:`,
      playbook.config?.campaign?.name || playbook.name
    );

    if (!campaignName?.trim()) {
      return;
    }

    try {
      const res = await fetch(`/api/playbooks/${playbook.id}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_name: campaignName.trim(),
          mailbox_id: null, // User can set this later
          segment_id: null, // User can set this later
        }),
      });

      const data = await res.json();
      if (data.success && data.campaign_id) {
        router.push(`/campaigns/${data.campaign_id}/review`);
      } else {
        alert(data.error || "Failed to create campaign");
      }
    } catch (error) {
      console.error("Error instantiating playbook:", error);
      alert("Failed to create campaign");
    }
  };

  const categories = Array.from(
    new Set(playbooks.map((p) => p.category).filter(Boolean))
  ) as string[];

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Playbooks</h1>
        <p className="text-gray-600">
          Prebuilt campaign sequences ready to launch. Choose a playbook to get
          started.
        </p>
      </div>

      {categories.length > 0 ? (
        <div className="space-y-8">
          {categories.map((category) => {
            const categoryPlaybooks = playbooks.filter(
              (p) => p.category === category
            );
            return (
              <div key={category}>
                <h2 className="text-xl font-semibold mb-4">{category}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryPlaybooks.map((playbook) => (
                    <div
                      key={playbook.id}
                      className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
                    >
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold mb-2">
                          {playbook.name}
                        </h3>
                        {playbook.description && (
                          <p className="text-sm text-gray-600 mb-4">
                            {playbook.description}
                          </p>
                        )}
                        {playbook.is_global && (
                          <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            Global
                          </span>
                        )}
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">Steps:</p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {(playbook.config?.templates || []).map(
                            (template: any, idx: number) => (
                              <li key={idx}>
                                Step {template.step || idx + 1}:{" "}
                                {template.subject || "No subject"}
                              </li>
                            )
                          )}
                        </ul>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleInstantiate(playbook)}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          Use This Playbook
                        </button>
                        <button
                          onClick={() => handleUsePlaybook(playbook)}
                          className="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">No playbooks available.</p>
        </div>
      )}

      {/* Side Panel for Details */}
      {selectedPlaybook && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">{selectedPlaybook.name}</h2>
                <button
                  onClick={() => setSelectedPlaybook(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              {selectedPlaybook.description && (
                <p className="text-gray-600 mb-6">{selectedPlaybook.description}</p>
              )}

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2">Sequence Steps</h3>
                  <div className="space-y-4">
                    {(selectedPlaybook.config?.templates || []).map(
                      (template: any, idx: number) => (
                        <div key={idx} className="border-l-4 border-blue-500 pl-4">
                          <div className="font-medium mb-1">
                            Step {template.step || idx + 1}
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            <strong>Subject:</strong> {template.subject}
                          </div>
                          <div className="text-sm text-gray-600">
                            <strong>Body:</strong>{" "}
                            <div
                              className="mt-1"
                              dangerouslySetInnerHTML={{
                                __html:
                                  template.body?.substring(0, 200) + "..." ||
                                  "No body",
                              }}
                            />
                          </div>
                          {template.variants && template.variants.length > 0 && (
                            <div className="mt-2 text-xs text-gray-500">
                              {template.variants.length} variant(s)
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>

                {selectedPlaybook.config?.recommended_segment?.hints && (
                  <div>
                    <h3 className="font-semibold mb-2">Recommended Segment</h3>
                    <ul className="list-disc list-inside text-sm text-gray-600">
                      {selectedPlaybook.config.recommended_segment.hints.map(
                        (hint: string, idx: number) => (
                          <li key={idx}>{hint}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {selectedPlaybook.config?.send_settings && (
                  <div>
                    <h3 className="font-semibold mb-2">Send Settings</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      {selectedPlaybook.config.send_settings
                        .respect_local_timezones && (
                        <div>✓ Respect local timezones</div>
                      )}
                      {selectedPlaybook.config.send_settings.business_hours && (
                        <div>
                          Business hours:{" "}
                          {selectedPlaybook.config.send_settings.business_hours
                            .start}{" "}
                          -{" "}
                          {selectedPlaybook.config.send_settings.business_hours
                            .end}
                        </div>
                      )}
                      {selectedPlaybook.config.send_settings.avoid_weekends && (
                        <div>✓ Avoid weekends</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => {
                    setSelectedPlaybook(null);
                    handleInstantiate(selectedPlaybook);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Use This Playbook
                </button>
                <button
                  onClick={() => setSelectedPlaybook(null)}
                  className="px-4 py-2 border rounded hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}








