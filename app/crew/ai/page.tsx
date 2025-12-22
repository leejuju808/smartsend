"use client";

// Block 253300 — SmartSend AI Field Assistant v1
// Crew AI Chatbot for Instructions, Safety Tips, Material Lookups, Install Guides, Real-Time Troubleshooting

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    title: string;
    category: string;
    source: string;
    similarity: number;
  }>;
}

const QUICK_QUESTIONS = [
  "How do I install step flashing?",
  "What is the correct nail pattern?",
  "What do I do with rotten decking?",
  "What's the manufacturer spec for ridge caps?",
  "What's the OSHA rule for ladders today?",
  "Do I need a harness for this roof pitch?",
  "How do I install ventilation for this roof pitch?",
  "What do I do if decking is soft?",
  "Can I install shingles at 40°F?",
  "What's the proper starter row pattern?",
  "The shingle won't lay flat — why?",
  "There's a pipe boot cracked underneath shingles — what do I do?",
  "How many bundles for 31 squares?",
  "Is it safe to install in these winds?",
];

export default function AIFieldAssistantPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (question?: string) => {
    const query = question || input.trim();
    if (!query || loading) return;

    // Add user message
    const userMessage: Message = { role: "user", content: query };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/field-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please try again or contact your project manager.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    handleSend(question);
    // Scroll to input after selecting quick question
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.back()}
            className="text-white hover:text-orange-100"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold">SmartSend AI</h1>
          <div className="w-8" /> {/* Spacer for centering */}
        </div>
        <p className="text-sm text-orange-100">
          Your roofing assistant • Installation • Safety • Materials • Warranty
        </p>
      </div>

      {/* Quick Questions */}
      {messages.length === 0 && (
        <div className="p-4 bg-white border-b">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            💬 Quick Questions
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {QUICK_QUESTIONS.slice(0, 6).map((question, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickQuestion(question)}
                className="text-left px-4 py-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-sm text-gray-800 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-4xl mb-4">🤖</div>
            <p className="text-lg font-medium mb-2">
              Ask me anything about roofing
            </p>
            <p className="text-sm">
              Installation guides • Safety tips • Material specs • Troubleshooting
            </p>
          </div>
        )}

        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                message.role === "user"
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-200 text-gray-900"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-2">Sources:</p>
                  <div className="space-y-1">
                    {message.sources.slice(0, 3).map((source, sidx) => (
                      <div key={sidx} className="text-xs text-gray-600">
                        • {source.title} ({source.category})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* More Quick Questions (shown when there are messages) */}
      {messages.length > 0 && (
        <div className="px-4 pb-2 border-t bg-white">
          <div className="flex overflow-x-auto gap-2 py-3 -mx-4 px-4">
            {QUICK_QUESTIONS.slice(6, 10).map((question, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickQuestion(question)}
                className="flex-shrink-0 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 whitespace-nowrap"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t bg-white p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about installation, safety, materials, troubleshooting..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            rows={1}
            style={{ minHeight: "48px", maxHeight: "120px" }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
























