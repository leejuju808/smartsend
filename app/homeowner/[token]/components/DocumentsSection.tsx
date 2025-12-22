"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ExternalLink } from "lucide-react";

type Document = {
  id: string;
  name: string;
  type: string;
  url: string | null;
  created_at: string;
};

interface DocumentsSectionProps {
  documents: Document[];
}

const getDocumentIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case "estimate":
    case "quote":
      return "📄";
    case "contract":
      return "📋";
    case "warranty":
      return "🛡️";
    case "invoice":
      return "💰";
    default:
      return "📎";
  }
};

const getDocumentLabel = (type: string) => {
  switch (type.toLowerCase()) {
    case "estimate":
      return "Estimate";
    case "quote":
      return "Quote";
    case "contract":
      return "Contract";
    case "warranty":
      return "Warranty";
    case "invoice":
      return "Invoice";
    case "insurance":
      return "Insurance Documents";
    default:
      return type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
};

export function DocumentsSection({ documents }: DocumentsSectionProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">{getDocumentIcon(doc.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {doc.name || getDocumentLabel(doc.type)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {getDocumentLabel(doc.type)} •{" "}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {doc.url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(doc.url!, "_blank")}
                  className="ml-2"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}






































