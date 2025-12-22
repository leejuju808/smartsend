"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Daily Photo Feed Component (Instagram-style layout)

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Clock } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";

interface Photo {
  id: string;
  photo_url: string;
  caption: string | null;
  photo_type: "before" | "during" | "after";
  uploaded_at: string;
}

interface DailyPhotoFeedProps {
  photos: Photo[];
}

export function DailyPhotoFeed({ photos }: DailyPhotoFeedProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  if (photos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Daily Photo Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No photos yet. Photos will appear here as work progresses.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group photos by date
  const photosByDate = photos.reduce((acc, photo) => {
    const date = format(new Date(photo.uploaded_at), "yyyy-MM-dd");
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(photo);
    return acc;
  }, {} as Record<string, Photo[]>);

  const sortedDates = Object.keys(photosByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Daily Photo Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {sortedDates.map((date) => (
              <div key={date} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {format(new Date(date), "EEEE, MMMM d, yyyy")}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {photosByDate[date].map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square cursor-pointer group"
                      onClick={() => setSelectedPhoto(photo)}
                    >
                      <div className="relative w-full h-full rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-colors">
                        <img
                          src={photo.photo_url}
                          alt={photo.caption || "Job photo"}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          {photo.caption && (
                            <p className="text-white text-xs line-clamp-2">
                              {photo.caption}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="absolute top-2 right-2">
                        <Badge
                          variant={
                            photo.photo_type === "before"
                              ? "secondary"
                              : photo.photo_type === "during"
                              ? "default"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {photo.photo_type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 text-2xl font-bold"
            >
              ×
            </button>
            <img
              src={selectedPhoto.photo_url}
              alt={selectedPhoto.caption || "Job photo"}
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            {selectedPhoto.caption && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white rounded-b-lg">
                <p>{selectedPhoto.caption}</p>
                <p className="text-sm text-gray-300 mt-1">
                  {format(
                    new Date(selectedPhoto.uploaded_at),
                    "MMM d, yyyy 'at' h:mm a"
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}




























