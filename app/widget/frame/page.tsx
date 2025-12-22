// Block 140000 — SmartSend Roofing Website Widget Frame
// Public page: /widget/frame?company_id=...
// Renders the chat interface inside an iframe

"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Message {
  id: string;
  sender: "visitor" | "bot";
  message: string;
  createdAt: string;
}

function WidgetFrameContent() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("company_id");
  
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [step, setStep] = useState(1); // 1=name, 2=contact, 3=address, 4=problem
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize session
  useEffect(() => {
    if (!companyId) return;
    
    const initSession = async () => {
      try {
        const res = await fetch("/api/widget/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: companyId }),
        });
        const data = await res.json();
        if (data.session_token) {
          setSessionToken(data.session_token);
          setStep(data.step || 1);
          
          // Load existing messages
          if (data.messages) {
            setMessages(data.messages);
          } else {
            // Show welcome message
            const welcomeRes = await fetch("/api/widget/widget-settings", {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            });
            const settings = await welcomeRes.json();
            const welcomeMsg = settings.welcome_message || "Hey! Need help with your roof?";
            
            setMessages([
              {
                id: "welcome",
                sender: "bot",
                message: welcomeMsg,
                createdAt: new Date().toISOString(),
              },
            ]);
            
            // Show first question
            setTimeout(() => {
              setMessages((prev) => [
                ...prev,
                {
                  id: "step1",
                  sender: "bot",
                  message: "What's your name?",
                  createdAt: new Date().toISOString(),
                },
              ]);
            }, 500);
          }
        }
      } catch (error) {
        console.error("Failed to initialize session:", error);
      }
    };
    
    initSession();
  }, [companyId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getBotQuestion = (currentStep: number) => {
    switch (currentStep) {
      case 1:
        return "What's your name?";
      case 2:
        return "How can we reach you? (Phone number or email)";
      case 3:
        return "What's your address or ZIP code?";
      case 4:
        return "Tell us what's going on with your roof:";
      default:
        return "";
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !sessionToken || isLoading || isComplete) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Add user message to UI
    const newUserMessage: Message = {
      id: `user-${Date.now()}`,
      sender: "visitor",
      message: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      // Send message to API
      const res = await fetch("/api/widget/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_token: sessionToken,
          message: userMessage,
        }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Update step
      if (data.step !== undefined) {
        setStep(data.step);
      }

      // Add bot response
      if (data.bot_message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: "bot",
            message: data.bot_message,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      // Check if complete
      if (data.complete) {
        setIsComplete(true);
        setMessages((prev) => [
          ...prev,
          {
            id: "complete",
            sender: "bot",
            message: "Thanks! We'll be in touch soon. Someone from our team will reach out to help with your roof.",
            createdAt: new Date().toISOString(),
          },
        ]);
        
        // Notify parent to close widget after delay
        setTimeout(() => {
          if (window.parent) {
            window.parent.postMessage("smartsend-widget-close", "*");
          }
        }, 3000);
      } else if (data.step && data.step < 99) {
        // Show next question
        const nextQuestion = getBotQuestion(data.step);
        if (nextQuestion) {
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-${Date.now()}`,
                sender: "bot",
                message: nextQuestion,
                createdAt: new Date().toISOString(),
              },
            ]);
          }, 300);
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: "bot",
          message: "Sorry, something went wrong. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-gray-500">Invalid widget configuration</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="bg-orange-500 text-white p-4 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Roofing Help</h2>
        <button
          onClick={() => {
            if (window.parent) {
              window.parent.postMessage("smartsend-widget-close", "*");
            }
          }}
          className="text-white hover:bg-orange-600 rounded p-1"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender === "visitor" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.sender === "visitor"
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <span className="animate-pulse">...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!isComplete && (
        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WidgetFramePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <WidgetFrameContent />
    </Suspense>
  );
}


























