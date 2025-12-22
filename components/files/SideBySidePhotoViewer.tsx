"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Photo = {
  id: string;
  url: string;
  file_name: string;
  created_at: string;
  ai_label?: string;
  detected_damage_type?: string;
};

type SideBySidePhotoViewerProps = {
  photos: Photo[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
  onSelectPair?: (photo1: Photo, photo2: Photo) => void;
};

export function SideBySidePhotoViewer({
  photos,
  initialIndex = 0,
  open,
  onClose,
  onSelectPair,
}: SideBySidePhotoViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [selectedPair, setSelectedPair] = useState<[number | null, number | null]>([null, null]);
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");

  const currentPhoto = photos[selectedIndex];
  const photo1 = selectedPair[0] !== null ? photos[selectedPair[0]] : null;
  const photo2 = selectedPair[1] !== null ? photos[selectedPair[1]] : null;

  const handlePrevious = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const handleSelectForComparison = (index: number) => {
    if (selectedPair[0] === null) {
      setSelectedPair([index, null]);
    } else if (selectedPair[1] === null) {
      setSelectedPair([selectedPair[0], index]);
      setViewMode("compare");
    } else {
      // Reset and select new first photo
      setSelectedPair([index, null]);
      setViewMode("single");
    }
  };

  const handleClearComparison = () => {
    setSelectedPair([null, null]);
    setViewMode("single");
  };

  if (!open || photos.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[95vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle>
              {viewMode === "compare" ? "Compare Photos" : currentPhoto?.file_name || "Photo Viewer"}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6">
          {/* Mode Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "single" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("single")}
              >
                Single View
              </Button>
              <Button
                variant={viewMode === "compare" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (selectedPair[0] !== null && selectedPair[1] !== null) {
                    setViewMode("compare");
                  }
                }}
                disabled={selectedPair[0] === null || selectedPair[1] === null}
              >
                Compare Mode
              </Button>
            </div>

            {viewMode === "compare" && (
              <Button variant="outline" size="sm" onClick={handleClearComparison}>
                Clear Comparison
              </Button>
            )}
          </div>

          {/* Photo Display */}
          {viewMode === "single" ? (
            <div className="relative">
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: "60vh" }}>
                {currentPhoto?.url && (
                  <img
                    src={currentPhoto.url}
                    alt={currentPhoto.file_name}
                    className="w-full h-auto max-h-[70vh] object-contain mx-auto"
                  />
                )}

                {/* Navigation Arrows */}
                {photos.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                      onClick={handlePrevious}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                      onClick={handleNext}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}

                {/* Photo Info Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{currentPhoto?.file_name}</p>
                      {currentPhoto?.ai_label && (
                        <p className="text-sm text-gray-300 mt-1">
                          Label: {currentPhoto.ai_label}
                          {currentPhoto.detected_damage_type && ` • Damage: ${currentPhoto.detected_damage_type}`}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectForComparison(selectedIndex)}
                      className="bg-white/10 hover:bg-white/20 border-white/20 text-white"
                    >
                      Select for Comparison
                    </Button>
                  </div>
                </div>
              </div>

              {/* Thumbnail Strip */}
              {photos.length > 1 && (
                <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
                  {photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      onClick={() => setSelectedIndex(index)}
                      className={`flex-shrink-0 w-20 h-20 rounded overflow-hidden border-2 ${
                        index === selectedIndex ? "border-blue-500" : "border-transparent"
                      }`}
                    >
                      <img
                        src={photo.url}
                        alt={photo.file_name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Photo 1 */}
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: "60vh" }}>
                {photo1?.url && (
                  <img
                    src={photo1.url}
                    alt={photo1.file_name}
                    className="w-full h-auto max-h-[70vh] object-contain mx-auto"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-3">
                  <p className="text-sm font-medium">{photo1?.file_name || "Select Photo 1"}</p>
                  {photo1?.ai_label && (
                    <p className="text-xs text-gray-300 mt-1">
                      {photo1.ai_label}
                      {photo1.detected_damage_type && ` • ${photo1.detected_damage_type}`}
                    </p>
                  )}
                </div>
                {selectedPair[0] !== null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => handleSelectForComparison(selectedPair[0]!)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Photo 2 */}
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ minHeight: "60vh" }}>
                {photo2?.url && (
                  <img
                    src={photo2.url}
                    alt={photo2.file_name}
                    className="w-full h-auto max-h-[70vh] object-contain mx-auto"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-3">
                  <p className="text-sm font-medium">{photo2?.file_name || "Select Photo 2"}</p>
                  {photo2?.ai_label && (
                    <p className="text-xs text-gray-300 mt-1">
                      {photo2.ai_label}
                      {photo2.detected_damage_type && ` • ${photo2.detected_damage_type}`}
                    </p>
                  )}
                </div>
                {selectedPair[1] !== null && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => handleSelectForComparison(selectedPair[1]!)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Photo Selection Grid (for comparison mode) */}
          {viewMode === "single" && selectedPair[0] !== null && selectedPair[1] === null && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">
                Select second photo for comparison:
              </p>
              <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                {photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => handleSelectForComparison(index)}
                    disabled={index === selectedPair[0]}
                    className={`relative rounded overflow-hidden border-2 ${
                      index === selectedPair[0]
                        ? "border-blue-500 opacity-50"
                        : "border-transparent hover:border-blue-300"
                    }`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.file_name}
                      className="w-full h-20 object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}





















































