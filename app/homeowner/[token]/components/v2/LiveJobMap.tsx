"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Live Job Map Component with GPS Integration

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";

interface CrewStatus {
  status: string;
  location_type: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  timestamp: string | null;
}

interface LiveJobMapProps {
  crewStatus: CrewStatus;
  jobAddress: string | null;
  jobLatitude?: number | null;
  jobLongitude?: number | null;
}

export function LiveJobMap({
  crewStatus,
  jobAddress,
  jobLatitude,
  jobLongitude,
}: LiveJobMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    // Check if Google Maps is available
    if (typeof window !== "undefined" && (window as any).google) {
      setMapLoaded(true);
    }
  }, []);

  const getStatusBadge = () => {
    switch (crewStatus.location_type) {
      case "en_route":
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Navigation className="h-3 w-3 animate-pulse" />
            Crew En Route
          </Badge>
        );
      case "on_site":
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Crew On Site
          </Badge>
        );
      case "left_site":
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Crew Left Site
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Not Arrived
          </Badge>
        );
    }
  };

  const getMapUrl = () => {
    // Use job coordinates if available, otherwise use address
    if (crewStatus.latitude && crewStatus.longitude) {
      // Show crew location
      return `https://www.google.com/maps?q=${crewStatus.latitude},${crewStatus.longitude}&z=15`;
    } else if (jobLatitude && jobLongitude) {
      // Show job site
      return `https://www.google.com/maps?q=${jobLatitude},${jobLongitude}&z=15`;
    } else if (jobAddress) {
      // Use address
      return `https://www.google.com/maps?q=${encodeURIComponent(jobAddress)}`;
    }
    return null;
  };

  const mapUrl = getMapUrl();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Live Job Map
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status Information */}
          <div className="space-y-2">
            {crewStatus.location_type === "en_route" && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <Navigation className="h-4 w-4 animate-pulse" />
                <span>Your crew is on the way!</span>
              </div>
            )}
            {crewStatus.location_type === "on_site" && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>Your crew has arrived and is working.</span>
              </div>
            )}
            {crewStatus.location_type === "left_site" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4" />
                <span>Your crew has finished for the day.</span>
              </div>
            )}
            {!crewStatus.location_type && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Crew has not arrived yet.</span>
              </div>
            )}

            {crewStatus.timestamp && (
              <p className="text-xs text-muted-foreground">
                Last updated:{" "}
                {format(new Date(crewStatus.timestamp), "MMM d, h:mm a")}
              </p>
            )}
          </div>

          {/* Map */}
          {mapUrl ? (
            <div className="relative w-full h-64 rounded-lg overflow-hidden border">
              <iframe
                src={mapUrl}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full"
              />
            </div>
          ) : (
            <div className="relative w-full h-64 rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Map unavailable</p>
                {jobAddress && (
                  <p className="text-sm mt-1">{jobAddress}</p>
                )}
              </div>
            </div>
          )}

          {/* Address Display */}
          {(crewStatus.address || jobAddress) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Job Site Location</p>
                <p className="text-muted-foreground">
                  {crewStatus.address || jobAddress}
                </p>
              </div>
            </div>
          )}

          {/* Arrival Window (if en route) */}
          {crewStatus.location_type === "en_route" && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900">
                Estimated Arrival
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Crew is on the way. Expected arrival window will be displayed
                here.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}




























