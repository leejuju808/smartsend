import { getWorkspaces } from "./actions";
import WorkspaceInvite from "./WorkspaceInvite";

export default async function WorkspacesPage() {
  const wss = await getWorkspaces();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">👥 Workspaces</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {wss?.map((w) => (
          <a key={w.id} href={`/workspace/${w.id}`} className="block p-4 rounded-2xl border hover:bg-white/5">
            <div className="font-semibold">{w.name}</div>
            <div className="text-xs text-gray-400">{w.id}</div>
          </a>
        ))}
      </div>
    </div>
  );
}