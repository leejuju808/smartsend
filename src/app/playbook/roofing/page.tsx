"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { BookOpen, Mail, MessageSquare, ArrowRight, Copy, Check } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";
import { fetchRoofingContextForUser } from "@/lib/ai/localized-coaching";

interface PlaybookTopic {
  id: string;
  key: string;
  title: string;
  description: string | null;
}

interface PlaybookEntry {
  id: string;
  topic_id: string;
  entry_type: string;
  title: string;
  body: string;
}

export default function RoofingPlaybookPage() {
  const supabase = createClientComponentClient();
  const [topics, setTopics] = useState<PlaybookTopic[]>([]);
  const [entries, setEntries] = useState<Record<string, PlaybookEntry[]>>({});
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<{ city: string | null; state: string | null }>({
    city: null,
    state: null,
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get user context
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const userContext = await fetchRoofingContextForUser(user.id);
        setContext({
          city: userContext.city,
          state: userContext.state,
        });
      }

      // Fetch topics
      const { data: topicsData, error: topicsError } = await supabase
        .from("roofing_playbook_topics")
        .select("*")
        .order("title", { ascending: true });

      if (topicsError) throw topicsError;
      setTopics(topicsData || []);

      // Fetch all entries
      const { data: entriesData, error: entriesError } = await supabase
        .from("roofing_playbook_entries")
        .select("*")
        .order("created_at", { ascending: true });

      if (entriesError) throw entriesError;

      // Group entries by topic
      const entriesByTopic: Record<string, PlaybookEntry[]> = {};
      (entriesData || []).forEach((entry) => {
        if (!entriesByTopic[entry.topic_id]) {
          entriesByTopic[entry.topic_id] = [];
        }
        entriesByTopic[entry.topic_id].push(entry);
      });

      setEntries(entriesByTopic);

      // Select first topic by default
      if (topicsData && topicsData.length > 0) {
        setSelectedTopic(topicsData[0].id);
      }
    } catch (error) {
      console.error("Error fetching playbook:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentEntries = selectedTopic ? entries[selectedTopic] || [] : [];
  const selectedTopicData = topics.find((t) => t.id === selectedTopic);

  const handleCopy = async (text: string, entryId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entryId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const getEntryIcon = (type: string) => {
    switch (type) {
      case "email_example":
        return <Mail className="w-5 h-5" />;
      case "reply_script":
        return <MessageSquare className="w-5 h-5" />;
      case "followup_script":
        return <ArrowRight className="w-5 h-5" />;
      default:
        return <BookOpen className="w-5 h-5" />;
    }
  };

  const getEntryTypeLabel = (type: string) => {
    switch (type) {
      case "email_example":
        return "Cold Email Example";
      case "reply_script":
        return "Reply Script";
      case "pricing_angle":
        return "Pricing Angle";
      case "followup_script":
        return "Follow-Up Script";
      default:
        return type;
    }
  };

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
          <h1 className="text-3xl font-bold">Your Roofing Sales Manual</h1>
        </div>
        <p className="text-gray-600 mb-2">
          {context.city && context.state
            ? `SmartSend has pre-built roofing scripts for markets like ${context.city}, ${context.state}. Use these as starting points, then let AI personalize them for each homeowner.`
            : "SmartSend has pre-built roofing scripts for your market. Use these as starting points, then let AI personalize them for each homeowner."}
        </p>
        <p className="text-sm text-gray-500">
          All examples are written as if you are a roofing salesperson. Copy, customize, and use them in your campaigns.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Topics */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Topics</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav className="space-y-1">
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => setSelectedTopic(topic.id)}
                    className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${
                      selectedTopic === topic.id
                        ? "bg-blue-50 text-blue-900 border-l-4 border-blue-600"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {topic.title}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Entries */}
        <div className="lg:col-span-3">
          {selectedTopic && selectedTopicData ? (
            <div className="space-y-6">
              {/* Topic Header */}
              <Card className="border-l-4 border-l-blue-600">
                <CardHeader>
                  <CardTitle className="text-2xl">{selectedTopicData.title}</CardTitle>
                  {selectedTopicData.description && (
                    <p className="text-gray-600 mt-2">{selectedTopicData.description}</p>
                  )}
                </CardHeader>
              </Card>

              {/* When to Use Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">When to Use This Angle</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">
                    {selectedTopicData.description ||
                      `Use this angle when ${selectedTopicData.title.toLowerCase()}.`}
                  </p>
                </CardContent>
              </Card>

              {/* Entries by Type */}
              {currentEntries.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    No examples available for this topic yet.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Email Examples */}
                  {currentEntries.filter((e) => e.entry_type === "email_example").length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Cold Email Examples</h3>
                      {currentEntries
                        .filter((e) => e.entry_type === "email_example")
                        .map((entry) => (
                          <Card key={entry.id} className="relative">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {getEntryIcon(entry.entry_type)}
                                  <CardTitle className="text-lg">{entry.title}</CardTitle>
                                </div>
                                <button
                                  onClick={() => handleCopy(entry.body, entry.id)}
                                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  {copiedId === entry.id ? (
                                    <>
                                      <Check className="w-4 h-4" />
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="bg-gray-50 p-4 rounded-lg border">
                                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                                  {entry.body}
                                </pre>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}

                  {/* Reply Scripts */}
                  {currentEntries.filter((e) => e.entry_type === "reply_script").length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Reply Scripts</h3>
                      {currentEntries
                        .filter((e) => e.entry_type === "reply_script")
                        .map((entry) => (
                          <Card key={entry.id} className="relative">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {getEntryIcon(entry.entry_type)}
                                  <CardTitle className="text-lg">{entry.title}</CardTitle>
                                </div>
                                <button
                                  onClick={() => handleCopy(entry.body, entry.id)}
                                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  {copiedId === entry.id ? (
                                    <>
                                      <Check className="w-4 h-4" />
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="bg-gray-50 p-4 rounded-lg border">
                                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                                  {entry.body}
                                </pre>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}

                  {/* Follow-up Scripts */}
                  {currentEntries.filter((e) => e.entry_type === "followup_script").length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Follow-Up Scripts</h3>
                      {currentEntries
                        .filter((e) => e.entry_type === "followup_script")
                        .map((entry) => (
                          <Card key={entry.id} className="relative">
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  {getEntryIcon(entry.entry_type)}
                                  <CardTitle className="text-lg">{entry.title}</CardTitle>
                                </div>
                                <button
                                  onClick={() => handleCopy(entry.body, entry.id)}
                                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  {copiedId === entry.id ? (
                                    <>
                                      <Check className="w-4 h-4" />
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="bg-gray-50 p-4 rounded-lg border">
                                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                                  {entry.body}
                                </pre>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}

                  {/* Other Entry Types */}
                  {currentEntries
                    .filter(
                      (e) =>
                        !["email_example", "reply_script", "followup_script"].includes(
                          e.entry_type
                        )
                    )
                    .map((entry) => (
                      <Card key={entry.id} className="relative">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              {getEntryIcon(entry.entry_type)}
                              <CardTitle className="text-lg">
                                {getEntryTypeLabel(entry.entry_type)}: {entry.title}
                              </CardTitle>
                            </div>
                            <button
                              onClick={() => handleCopy(entry.body, entry.id)}
                              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              {copiedId === entry.id ? (
                                <>
                                  <Check className="w-4 h-4" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4" />
                                  Copy
                                </>
                              )}
                            </button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-gray-50 p-4 rounded-lg border">
                            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                              {entry.body}
                            </pre>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
              Select a topic to view examples.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


























