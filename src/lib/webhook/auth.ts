export function verifySecret(req: Request, expected: string | undefined) {
  const got = req.headers.get("x-ss-signature") || "";
  if (!expected || got !== expected) {
    const err = new Error("Unauthorized: bad signature");
    // @ts-ignore
    err.statusCode = 401;
    throw err;
  }
}

export function requireUserIdFromQuery(req: Request): string {
  const url = new URL(req.url);
  const user = url.searchParams.get("user");
  if (!user) {
    const err = new Error("Missing user mapping (?user=<auth_user_id>)");
    // @ts-ignore
    err.statusCode = 400;
    throw err;
  }
  return user;
}
