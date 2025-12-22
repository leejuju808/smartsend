// components/TopNav.tsx
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export default async function TopNav() {
  const ws = await getActiveWorkspaceId();
  return (
    <div className="h-12 border-b flex items-center justify-between px-4">
      <div className="font-semibold">SmartSend</div>
      {/* @ts-expect-error Server/Client boundary */}
      <WorkspaceSwitcher current={ws ?? undefined} />
    </div>
  );
}
