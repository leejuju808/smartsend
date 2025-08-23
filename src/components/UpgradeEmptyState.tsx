import Link from "next/link";

export default function UpgradeEmptyState({ title = "Go Pro to activate this feature" }: { title?: string }) {
  return (
    <div className="border rounded-lg p-6 text-center">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">
        Upgrade to create campaigns, auto-insert meeting invites, and run automations.
      </p>
      <Link href="/dashboard/billing?upgrade=1" className="inline-block px-4 py-2 rounded bg-black text-white">
        Upgrade to Pro
      </Link>
    </div>
  );
} 