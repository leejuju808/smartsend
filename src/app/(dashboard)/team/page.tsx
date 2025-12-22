import TeamClient from "./ui/TeamClient";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Team</h1>
      {/* @ts-expect-error Server/Client boundary */}
      <TeamClient />
    </div>
  );
}
