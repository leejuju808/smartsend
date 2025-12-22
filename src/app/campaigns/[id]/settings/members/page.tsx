import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import Members from "./ui/Members";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <Members campaignId={params.id} currentUserId={user?.id ?? ""} />;
}











