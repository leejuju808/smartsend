import { BranchDetail } from "@/components/branches/BranchDetail";
import { notFound } from "next/navigation";

async function getBranch(id: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/branches/${id}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const branchData = await getBranch(id);

  if (!branchData) {
    notFound();
  }

  return (
    <div className="space-y-6 p-6">
      <BranchDetail branch={branchData.branch} users={branchData.users} resources={branchData.resources} />
    </div>
  );
}





















