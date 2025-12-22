// Block 16500 — Homeowner Snapshot (Left Panel)
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Home, 
  Tag,
  Copy,
  Check
} from "lucide-react";
import { useState } from "react";

interface HomeownerSnapshotProps {
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    neighborhood?: string | null;
  };
  tags: string[];
  enrichment?: {
    inferred_neighborhood: string | null;
    inferred_city: string | null;
    inferred_zip: string | null;
  } | null;
}

export function HomeownerSnapshot({ contact, tags, enrichment }: HomeownerSnapshotProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const displayName =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email;

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const neighborhood = enrichment?.inferred_neighborhood || contact.neighborhood;
  const city = contact.city || enrichment?.inferred_city;
  const zip = contact.zip || enrichment?.inferred_zip;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold">{displayName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Address */}
        {(contact.address || city || state || zip) && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Address
            </div>
            <div className="font-medium text-base">
              {contact.address && (
                <div>{contact.address}</div>
              )}
              <div className="text-sm text-muted-foreground">
                {[
                  neighborhood && `Neighborhood: ${neighborhood}`,
                  city,
                  state,
                  zip,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
          </div>
        )}

        {/* Phone */}
        {contact.phone && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Phone className="h-3 w-3" />
              Phone
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`tel:${contact.phone}`}
                className="font-medium text-base hover:text-blue-600"
              >
                {contact.phone}
              </a>
              <button
                onClick={() => copyToClipboard(contact.phone!, "phone")}
                className="text-muted-foreground hover:text-foreground"
              >
                {copied === "phone" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Email */}
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Email
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`mailto:${contact.email}`}
              className="font-medium text-base hover:text-blue-600 break-all"
            >
              {contact.email}
            </a>
            <button
              onClick={() => copyToClipboard(contact.email, "email")}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              {copied === "email" ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Tags
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs px-2 py-1"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* City/Zip Summary */}
        {(city || zip) && (
          <div className="pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-1">Location Summary</div>
            <div className="text-sm font-medium">
              {city && <div>{city}</div>}
              {zip && <div className="text-muted-foreground">{zip}</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}





















































