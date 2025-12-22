"use client";

import { useState } from "react";

interface UnsubscribeFooterProps {
  recipientEmail: string;
  className?: string;
  showUnsubscribeLink?: boolean;
}

export function UnsubscribeFooter({ 
  recipientEmail, 
  className = "",
  showUnsubscribeLink = true 
}: UnsubscribeFooterProps) {
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);

  const handleUnsubscribe = async () => {
    if (!recipientEmail || unsubscribed) return;
    
    setIsUnsubscribing(true);
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: recipientEmail, 
          reason: "user_unsubscribed",
          source: "ui"
        }),
      });
      
      if (response.ok) {
        setUnsubscribed(true);
      }
    } catch (error) {
      console.error("Unsubscribe error:", error);
    } finally {
      setIsUnsubscribing(false);
    }
  };

  if (unsubscribed) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        <span className="text-green-600">✓ Unsubscribed</span> - You won't receive more emails.
      </div>
    );
  }

  return (
    <div className={`text-sm text-gray-500 ${className}`}>
      <p>You are receiving this from SmartSend.</p>
      {showUnsubscribeLink && (
        <button
          onClick={handleUnsubscribe}
          disabled={isUnsubscribing}
          className="text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
        >
          {isUnsubscribing ? "Unsubscribing..." : "Unsubscribe"}
        </button>
      )}
    </div>
  );
}

export function EmailFooter({ recipientEmail }: { recipientEmail: string }) {
  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <UnsubscribeFooter recipientEmail={recipientEmail} />
    </div>
  );
} 