"use client";

import { useState } from "react";
import SmartMeetingInsert from "@/components/reply/SmartMeetingInsert";

export default function SmartMeetingDemoPage() {
  const [composerText, setComposerText] = useState("");
  const [insertedText, setInsertedText] = useState("");
  const [icsUrl, setIcsUrl] = useState<string | null>(null);

  const handleInsert = ({ text, icsUrl }: { text: string; icsUrl?: string }) => {
    setInsertedText(text);
    if (icsUrl) {
      setIcsUrl(icsUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Smart Meeting Insert Demo
          </h1>
          <p className="text-gray-600">
            This demo shows how the SmartMeetingInsert component automatically detects meeting intent
            and provides one-click insertion of meeting details and calendar invites.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Reply Composer
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type your reply (try: "Can we hop on a quick call tomorrow?")
                </label>
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  placeholder="Type your reply here..."
                />
              </div>

              {/* Smart Meeting Insert Component */}
              <SmartMeetingInsert
                composerText={composerText}
                organizerEmail="demo@smartsend.ai"
                onInsert={handleInsert}
              />

              <div className="text-sm text-gray-500">
                💡 <strong>Pro tip:</strong> Try typing phrases like:
                <ul className="mt-2 space-y-1">
                  <li>• "Can we hop on a quick call tomorrow?"</li>
                  <li>• "Let's schedule a meeting this week"</li>
                  <li>• "Do you have time for a Zoom chat?"</li>
                  <li>• "I'd love to jump on a call to discuss this"</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Generated Content
            </h2>
            
            <div className="space-y-4">
              {insertedText && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Inserted Text
                  </label>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                    {insertedText}
                  </div>
                </div>
              )}

              {icsUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Calendar Invite (.ics file)
                  </label>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-sm text-blue-800 mb-2">
                      ✅ Calendar invite generated successfully!
                    </p>
                    <a
                      href={icsUrl}
                      download="meeting.ics"
                      className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      📅 Download .ics file
                    </a>
                  </div>
                </div>
              )}

              {!insertedText && !icsUrl && (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-4">💬</div>
                  <p>Start typing a reply to see the magic happen!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="font-medium text-gray-900 mb-2">1. Intent Detection</h3>
              <p className="text-sm text-gray-600">
                Lightweight NLP analyzes reply text for meeting-related keywords and time hints
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">⚡</div>
              <h3 className="font-medium text-gray-900 mb-2">2. Smart Insertion</h3>
              <p className="text-sm text-gray-600">
                One-click button appears when meeting intent is detected
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">📅</div>
              <h3 className="font-medium text-gray-900 mb-2">3. Auto-Generation</h3>
              <p className="text-sm text-gray-600">
                Automatically generates calendar invite and inserts meeting text
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 