"use client";

export function ConnectGmail() {
  return (
    <a
      href="/api/oauth/sending-accounts/google/start"
      className="inline-flex items-center px-4 py-2 rounded-2xl bg-black text-white hover:opacity-90"
    >
      Connect Gmail
    </a>
  );
}
