import { Badge } from "@/components/ui/badge";

export function RoleBadge({ role }: { role?: "owner"|"editor"|"viewer"|null }) {
  if (!role) return null;
  const map: any = { owner: "default", editor: "secondary", viewer: "outline" };
  return <Badge variant={map[role] || "outline"}>{role}</Badge>;
}



