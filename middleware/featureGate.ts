export async function assertFeature(accountId: string, feature: string) {
  const res = await fetch(`/api/billing/caps/${accountId}`, {
    cache: "no-store",
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Unable to read caps");
  }

  const caps = data.caps ?? {};
  const value = caps[feature];

  if (
    value === false ||
    value === "0" ||
    value === 0 ||
    value === null ||
    value === undefined
  ) {
    throw new Error("UPGRADE_REQUIRED");
  }
}



