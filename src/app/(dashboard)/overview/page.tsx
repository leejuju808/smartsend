import OverviewClient from "./ui/OverviewClient";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  // Initial server fetch for fast paint
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/overview`, { cache: "no-store" });
  const initial = res.ok ? await res.json() : null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      {/* @ts-expect-error Server/Client boundary */}
      <OverviewClient initial={initial} />
    </div>
  );
}