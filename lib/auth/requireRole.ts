import { NextResponse } from "next/server";
import { getUserRole } from "./getUserRole";

export async function requireRole(allowed: string[]) {
  const roleData = await getUserRole();
  if (!roleData) {
    return { allowed: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  if (!allowed.includes(roleData.role)) {
    return { allowed: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { allowed: true, roleData };
}












