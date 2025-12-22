import { createClient } from "@/utils/supabase/server";
import { requireUserAndAccount } from "@/lib/supabase/server";
import { RepliesPageClient } from "@/components/replies/replies-page-client";

export default async function RepliesPage() {
  const supabase = createClient();

  try {
    const { account } = await requireUserAndAccount(supabase);
    const accountId = account.id;

    return <RepliesPageClient accountId={accountId} />;
  } catch (error) {
    // Handle error - redirect to sign-in or show error message
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Unable to load replies. Please sign in and try again.
        </p>
      </div>
    );
  }
}




