"use client";
import { useState } from "react";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setSubmitted(true);
    setEmail("");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-6">
      <h1 className="text-4xl font-bold mb-4">Join the SmartSend ⚡ Beta</h1>
      <p className="text-gray-400 mb-6">
        Be the first to experience AI-powered email automation.
      </p>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className="px-4 py-2 rounded-lg text-black w-72"
          />
          <button
            type="submit"
            className="px-6 py-2 rounded-lg bg-yellow-500 text-black font-semibold hover:bg-yellow-400 transition"
          >
            Join Waitlist
          </button>
        </form>
      ) : (
        <p className="text-green-400 mt-4">You're on the list — welcome aboard!</p>
      )}
    </div>
  );
}