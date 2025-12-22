import { BranchesList } from "@/components/branches/BranchesList";
import { CreateBranchButton } from "@/components/branches/CreateBranchButton";

export default function BranchesPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Branch Management</h1>
          <p className="text-sm text-gray-400">
            Manage all your branch offices, locations, and franchises
          </p>
        </div>
        <CreateBranchButton />
      </div>

      <BranchesList />
    </div>
  );
}





















