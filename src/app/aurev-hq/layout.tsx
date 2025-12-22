"use client";

import AUREVNavBar from "@/components/AUREVNavBar";

export default function AUREVHQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AUREVNavBar />
      {children}
    </div>
  );
}

