"use client";

import { Badge } from "@/components/ui/badge";
import { Star, CheckCircle2, User } from "lucide-react";
import { cn } from "@/lib/utils";

type ThreadBadgesProps = {
  important?: boolean;
  done?: boolean;
  assignedTo?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  tags?: string[];
  className?: string;
};

export function ThreadBadges({
  important,
  done,
  assignedTo,
  tags,
  className,
}: ThreadBadgesProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {/* Important Star */}
      {important && (
        <Badge variant="outline" className="text-xs border-yellow-500/50 bg-yellow-500/10">
          <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
          Important
        </Badge>
      )}

      {/* Done Badge */}
      {done && (
        <Badge variant="outline" className="text-xs border-gray-500/50 bg-gray-500/10 text-gray-600">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Done
        </Badge>
      )}

      {/* Assigned To */}
      {assignedTo && (
        <Badge variant="outline" className="text-xs">
          <User className="h-3 w-3 mr-1" />
          {assignedTo.name || assignedTo.email || "Assigned"}
        </Badge>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <>
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-xs bg-muted/50"
            >
              {tag}
            </Badge>
          ))}
        </>
      )}
    </div>
  );
}










