"use client";
import { useState } from "react";

export default function UnsubPage() {
  const [email, setEmail] = useState(""); 
  const [done, setDone] = useState(false);
  
  async function submit() {
    await fetch("/api/unsubscribe", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }) 
    });
    setDone(true);
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full border rounded p-6 text-center">
        <h1 className="text-xl font-bold mb-2">Unsubscribe</h1>
        {done ? (
          <p>✅ You're unsubscribed.</p>
        ) : (
          <>
            <input 
              className="border rounded px-3 py-2 w-full mb-3" 
              placeholder="email@domain.com"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
            <button 
              onClick={submit} 
              className="px-4 py-2 rounded bg-black text-white"
            >
              Unsubscribe
            </button>
          </>
        )}
      </div>
    </div>
  );
} 