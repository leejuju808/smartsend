export function RoleBadge({ role }: { role: "owner" | "admin" | "editor" | "viewer" }) {
  const label = role[0].toUpperCase() + role.slice(1);
  const styles = {
    owner: "bg-amber-100 text-amber-800",
    admin: "bg-indigo-100 text-indigo-800",
    editor: "bg-sky-100 text-sky-800",
    viewer: "bg-slate-100 text-slate-800",
  } as const;
  return (
    <span className={`px-2 py-0.5 rounded-2xl text-xs font-medium ${styles[role]}`}>{label}</span>
  );
}





