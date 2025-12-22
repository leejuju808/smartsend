"use client";

// Block 72000 — Service Area Map Component
// Interactive map with draggable pin and radius slider

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/Button";
import { MapPin, Navigation } from "lucide-react";

interface ServiceAreaMapProps {
  centerLat?: number;
  centerLng?: number;
  radiusMiles?: number;
  onLocationChange?: (lat: number, lng: number) => void;
  onRadiusChange?: (radius: number) => void;
  onSave?: () => void;
  isEditing?: boolean;
}

export function ServiceAreaMap({
  centerLat = 47.6062, // Default to Seattle
  centerLng = -122.3321,
  radiusMiles = 10,
  onLocationChange,
  onRadiusChange,
  onSave,
  isEditing = false,
}: ServiceAreaMapProps) {
  const [lat, setLat] = useState(centerLat);
  const [lng, setLng] = useState(centerLng);
  const [radius, setRadius] = useState(radiusMiles);
  const [isDragging, setIsDragging] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLat(centerLat);
    setLng(centerLng);
  }, [centerLat, centerLng]);

  useEffect(() => {
    setRadius(radiusMiles);
  }, [radiusMiles]);

  const handleRadiusChange = (value: number[]) => {
    const newRadius = value[0];
    setRadius(newRadius);
    onRadiusChange?.(newRadius);
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel coordinates to lat/lng (approximate)
    // This is a simplified conversion - in production, use proper map library
    const percentX = x / rect.width;
    const percentY = y / rect.height;

    // Approximate conversion (works for small areas)
    const newLat = lat + ((0.5 - percentY) * 0.1);
    const newLng = lng + ((percentX - 0.5) * 0.1);

    setLat(newLat);
    setLng(newLng);
    onLocationChange?.(newLat, newLng);
  };

  // Generate Google Maps embed URL with circle overlay
  const getMapUrl = () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    if (apiKey) {
      // Use Google Maps JavaScript API with circle overlay
      return `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${lat},${lng}&zoom=11`;
    }
    // Fallback to static map
    return `https://www.google.com/maps?q=${lat},${lng}&z=11`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Service Area Location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Map Display */}
        <div className="relative w-full h-96 rounded-lg overflow-hidden border bg-muted">
          <div
            ref={mapContainerRef}
            className="relative w-full h-full cursor-crosshair"
            onClick={handleMapClick}
          >
            {/* Google Maps iframe */}
            <iframe
              src={getMapUrl()}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full pointer-events-none"
            />

            {/* Draggable Pin Overlay */}
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 cursor-move z-10"
              style={{
                userSelect: "none",
                pointerEvents: isEditing ? "auto" : "none",
              }}
            >
              <div className="flex flex-col items-center">
                <MapPin
                  className={`h-8 w-8 ${isEditing ? "text-blue-600" : "text-gray-600"}`}
                  fill="currentColor"
                />
                {isEditing && (
                  <div className="mt-1 text-xs font-medium text-blue-600 bg-white px-2 py-1 rounded shadow">
                    Drag to move
                  </div>
                )}
              </div>
            </div>

            {/* Radius Circle Overlay (visual indicator) */}
            {isEditing && (
              <div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 border-2 border-blue-500 border-dashed rounded-full bg-blue-500/10"
                style={{
                  width: `${Math.min((radius / 11) * 100, 80)}%`, // Approximate radius visualization
                  height: `${Math.min((radius / 11) * 100, 80)}%`,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        </div>

        {/* Coordinates Display */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-medium">Lat:</span>
            <span>{lat.toFixed(6)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium">Lng:</span>
            <span>{lng.toFixed(6)}</span>
          </div>
        </div>

        {/* Radius Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Service Radius</label>
            <span className="text-sm text-muted-foreground">{radius} miles</span>
          </div>
          <Slider
            value={[radius]}
            onValueChange={handleRadiusChange}
            min={1}
            max={50}
            step={1}
            disabled={!isEditing}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 mi</span>
            <span>25 mi</span>
            <span>50 mi</span>
          </div>
        </div>

        {/* Save Button */}
        {isEditing && onSave && (
          <Button onClick={onSave} className="w-full" size="md">
            Save Service Area
          </Button>
        )}

        {/* Instructions */}
        {isEditing && (
          <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="font-medium text-blue-900 mb-1">How to set your service area:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Click on the map to set the center point</li>
              <li>Adjust the radius slider to define your service area</li>
              <li>Only leads within this radius will be included in campaigns</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



























