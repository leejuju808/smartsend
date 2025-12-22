import { encodeToken } from "@/lib/track";

type TrackArgs = {
  logId: string;
  campaignId: string;
  stepNo?: number | null;
  variantId?: string | null;
};

export function trackingPixelHTML(args: TrackArgs) {
  const t = encodeToken({
    l: args.logId,
    c: args.campaignId,
    s: args.stepNo ?? null,
    v: args.variantId ?? null,
  });
  const src = `https://app.smartsendhq.com/api/t/o?t=${t}`;
  return `<img src="${src}" alt="" width="1" height="1" style="display:none" />`;
}

export function trackLink(url: string, args: TrackArgs) {
  const t = encodeToken({
    l: args.logId,
    c: args.campaignId,
    s: args.stepNo ?? null,
    v: args.variantId ?? null,
    u: url,
  });
  return `https://app.smartsendhq.com/api/t/c?t=${t}`;
}

