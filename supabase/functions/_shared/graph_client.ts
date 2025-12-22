// deno-lint-ignore-file no-explicit-any

import { msEnsureAccessToken } from "./ms_oauth.ts";

export async function graphFetch<T>(
  sb: any,
  accountId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await msEnsureAccessToken(sb, accountId);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`graph ${path} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}




