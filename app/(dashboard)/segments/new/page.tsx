import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUserAndAccount } from "@/lib/supabase/server";
import { SegmentForm } from "@/components/segments/segment-form";
import { redirect } from "next/navigation";

export default async function NewSegmentPage() {
  const supabase = createClient();
  
  try {
    const { user, account } = await requireUserAndAccount(supabase);

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Create segment</h1>
        <SegmentForm accountId={account.id} ownerId={user.id} />
      </div>
    );
  } catch (err) {
    // Handle auth redirect or error
    redirect("/login");
  }
}














