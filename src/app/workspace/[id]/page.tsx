import { getWorkspace, listMembers } from "../workspaces/actions";
import InviteMembersDialog from "@/components/workspaces/InviteMembersDialog";

export default async function WorkspaceView({ params }: { params: { id: string } }) {
  const wsId = params.id;

  const ws = await getWorkspace(wsId);
  const members = await listMembers(wsId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ws?.name}</h1>
        <InviteMembersDialog workspaceId={wsId} />
      </div>
      
      <div className="rounded-2xl border">
        <div className="p-3 font-semibold">Members</div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left">User</th>
              <th className="p-2 text-left">Role</th>
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => (
              <tr key={m.user_id} className="border-t border-gray-800">
                <td className="p-2">{m.user_id}</td>
                <td className="p-2">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}