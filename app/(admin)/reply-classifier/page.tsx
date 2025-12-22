import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReplyClassifierAdminHome() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reply Classifier Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage heuristics and automation for reply intent classification.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/reply-classifier/patterns">
          <Card className="h-full transition hover:border-primary">
            <CardHeader>
              <CardTitle>OOO Patterns</CardTitle>
              <CardDescription>
                Maintain regex patterns that detect out-of-office auto-responses.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/reply-classifier/actions">
          <Card className="h-full transition hover:border-primary">
            <CardHeader>
              <CardTitle>Label Actions</CardTitle>
              <CardDescription>
                Configure automation executed when classifier labels are applied.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}



