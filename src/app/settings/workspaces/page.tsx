import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Link from "next/link";

export default async function WorkspacesPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
      },
    }
  );

  // Get current org
  const { data: current } = await supabase.rpc("fn_current_org");

  // Get list of orgs
  const { data: orgs } = await supabase.rpc("fn_list_my_orgs");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <Link href="/settings">
          <Button variant="outline">Back to Settings</Button>
        </Link>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Your workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          {orgs && orgs.length > 0 ? (
            <ul className="space-y-2">
              {orgs.map((o: any) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between border rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Role: {o.role}{" "}
                      {current === o.id ? "• current" : ""}
                    </div>
                  </div>
                  {current !== o.id && (
                    <form action="/api/org/switch" method="post">
                      <input type="hidden" name="orgId" value={o.id} />
                      <Button
                        type="submit"
                        variant="default"
                        size="sm"
                      >
                        Switch
                      </Button>
                    </form>
                  )}
                  {current === o.id && (
                    <span className="text-sm text-muted-foreground">
                      Current
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No workspaces found.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Create new workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/api/org/create" method="post" className="flex gap-2">
            <Input
              name="name"
              placeholder="Workspace name"
              className="max-w-sm"
              required
            />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

