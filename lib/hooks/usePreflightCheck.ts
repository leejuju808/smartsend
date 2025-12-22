import { useEffect, useState } from "react";

export function usePreflightCheck(campaignId: string) {
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [matched, setMatched] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preflight`);
      const json = await res.json();

      setErrors(json.errors ?? []);
      setWarnings(json.warnings ?? []);
      setMatched(json.matched ?? 0);
    } catch (err) {
      console.error("Preflight check error:", err);
      setErrors(["Failed to run preflight check"]);
      setWarnings([]);
      setMatched(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  return {
    errors,
    warnings,
    matched,
    loading,
    refresh,
    ok: errors.length === 0,
  };
}

