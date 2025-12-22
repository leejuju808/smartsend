"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface TeamInviteFormProps {
  teamId: string;
}

export default function TeamInviteForm({ teamId }: TeamInviteFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, teamId }),
      });

      if (response.ok) {
        setMessage("Invitation sent successfully!");
        setEmail("");
      } else {
        const error = await response.json();
        if (error.error === "seat_limit_reached") {
          setMessage(error.message || "Seat limit reached. Upgrade your plan to add more teammates.");
          setTimeout(() => {
            router.push("/dashboard/billing");
          }, 2000);
        } else {
          setMessage(error.error || error.message || "Failed to send invitation");
        }
      }
    } catch (error) {
      setMessage("Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded p-4">
      <h2 className="font-semibold mb-2">Invite Team Member</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          name="email"
          type="email"
          placeholder="teammate@company.com"
          className="border rounded px-3 py-2 flex-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? "Sending..." : "Invite"}
        </button>
      </form>
      {message && (
        <p className={`text-sm mt-2 ${message.includes("successfully") ? "text-green-600" : "text-red-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
} 