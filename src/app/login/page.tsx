"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type LoginMode = "magic-link" | "password";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [mode, setMode] = useState<LoginMode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const signInWithMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${redirectTo}` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Success - redirect will happen automatically via middleware
      router.push(redirectTo);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="bg-gray-950 border border-gray-800 p-8 rounded-2xl max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">Sign in to SmartSend ⚡</h1>
        <p className="text-gray-400 mb-6">
          {mode === "magic-link"
            ? "We'll send you a secure magic link."
            : "Enter your email and password."}
        </p>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6 p-1 bg-gray-900 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode("magic-link");
              setError("");
              setSent(false);
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === "magic-link"
                ? "bg-yellow-500 text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Magic Link
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError("");
              setSent(false);
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === "password"
                ? "bg-yellow-500 text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Password
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        {mode === "magic-link" ? (
          sent ? (
            <div className="text-green-400 p-4 bg-green-900/20 border border-green-700 rounded-lg">
              Check your email — magic link sent.
            </div>
          ) : (
            <form onSubmit={signInWithMagicLink} className="space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-2 rounded-lg text-black"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-yellow-500 text-black rounded-lg px-4 py-2 font-semibold hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Magic Link"}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={signInWithPassword} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-2 rounded-lg text-black"
              disabled={loading}
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-2 rounded-lg text-black"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 text-black rounded-lg px-4 py-2 font-semibold hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement forgot password flow
                  alert("Use Magic Link to sign in, or contact support to reset access.");
                }}
                className="text-sm text-gray-400 hover:text-white underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        )}

        {/* Create Account Link (Owner only - shown on signup page) */}
        <div className="mt-6 text-center text-sm text-gray-400">
          Don't have an account?{" "}
          <a
            href="/signup"
            className="text-yellow-500 hover:text-yellow-400 underline"
          >
            Create Account
          </a>
        </div>
      </div>
    </div>
  );
} 