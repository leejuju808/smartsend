"use client";
import { useState } from 'react';
import ObjectionAssistant from '@/components/ObjectionAssistant';

const SAMPLE_MESSAGES = [
  "This looks too expensive for our budget right now",
  "Not interested, thanks",
  "Can you send me more information about this?",
  "We're pretty busy this quarter, maybe next time",
  "We already have a tool for this",
  "Who are you guys? What does SmartSendAI do?",
  "The price is way too high for what you're offering",
  "Send me a deck or PDF with more details",
  "We're swamped with work right now, circle back later",
  "We're already using a similar solution from another vendor"
];

export default function ObjectionDemoPage() {
  const [selectedMessage, setSelectedMessage] = useState(SAMPLE_MESSAGES[0]);
  const [customMessage, setCustomMessage] = useState('');

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Objection Detection Demo</h1>
          <p className="text-gray-600 mb-6">
            Test the objection detection system with different messages and tones.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sample Messages
              </label>
              <select
                value={selectedMessage}
                onChange={(e) => setSelectedMessage(e.target.value)}
                className="w-full border rounded-md px-3 py-2"
              >
                {SAMPLE_MESSAGES.map((msg, i) => (
                  <option key={i} value={msg}>{msg}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or type your own message
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type a message to test objection detection..."
                className="w-full border rounded-md px-3 py-2 h-20"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Objection Assistant</h2>
          
          <ObjectionAssistant
            lastMessage={customMessage || selectedMessage}
            vars={{
              first_name: "Demo User",
              company: "Demo Company",
              my_name: "SmartSendAI Team",
              calendly: "https://calendly.com/demo/intro-30",
            }}
            onInsert={(text) => {
              console.log('Inserted text:', text);
              alert('Text would be inserted: ' + text.substring(0, 100) + '...');
            }}
          />
          
          {!customMessage && !selectedMessage && (
            <div className="text-center text-gray-500 py-8">
              Select a sample message or type your own to see objection detection in action.
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 