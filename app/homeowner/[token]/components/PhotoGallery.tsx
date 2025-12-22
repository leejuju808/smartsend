"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";

type Photo = {
  id: string;
  url: string;
  caption: string | null;
  tag: string;
  created_at: string;
};

interface PhotoGalleryProps {
  photos: Photo[];
}

const getTagLabel = (tag: string) => {
  switch (tag) {
    case "before":
      return "Before";
    case "during":
      return "During";
    case "after":
      return "After";
    default:
      return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
};

const getTagColor = (tag: string) => {
  switch (tag) {
    case "before":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "during":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "after":
      return "bg-green-100 text-green-800 border-green-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const openPhoto = (photo: Photo, index: number) => {
    setSelectedPhoto(photo);
    setSelectedIndex(index);
  };

  const closePhoto = () => {
    setSelectedPhoto(null);
  };

  const navigatePhoto = (direction: "prev" | "next") => {
    if (!selectedPhoto) return;
    const newIndex =
      direction === "next"
        ? (selectedIndex + 1) % photos.length
        : (selectedIndex - 1 + photos.length) % photos.length;
    setSelectedIndex(newIndex);
    setSelectedPhoto(photos[newIndex]);
  };

  // Group photos by tag
  const groupedPhotos = {
    before: photos.filter((p) => p.tag === "before"),
    during: photos.filter((p) => p.tag === "during"),
    after: photos.filter((p) => p.tag === "after"),
  };

  const allPhotos = [...groupedPhotos.before, ...groupedPhotos.during, ...groupedPhotos.after];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Latest Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No photos available yet.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Before → During → After sections */}
              {Object.entries(groupedPhotos).map(([tag, tagPhotos]) => {
                if (tagPhotos.length === 0) return null;
                return (
                  <div key={tag}>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={getTagColor(tag)}>
                        {getTagLabel(tag)}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {tagPhotos.length} photo{tagPhotos.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {tagPhotos.map((photo, idx) => {
                        const globalIndex = allPhotos.indexOf(photo);
                        return (
                          <div
                            key={photo.id}
                            className="relative aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity bg-gray-100"
                            onClick={() => openPhoto(photo, globalIndex)}
                          >
                            <img
                              src={photo.url}
                              alt={photo.caption || `Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {photo.caption && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 line-clamp-2">
                                {photo.caption}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Close button */}
            <button
              onClick={closePhoto}
              className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Photo */}
            <div className="relative bg-black flex items-center justify-center flex-1 min-h-[60vh]">
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.caption || "Photo"}
                className="max-w-full max-h-[80vh] object-contain"
              />

              {/* Navigation arrows */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => navigatePhoto("prev")}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => navigatePhoto("next")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Photo info */}
            <div className="bg-black/80 text-white p-4">
              <div className="flex items-center justify-between mb-2">
                <Badge className={getTagColor(selectedPhoto.tag)}>
                  {getTagLabel(selectedPhoto.tag)}
                </Badge>
                <span className="text-xs text-gray-400">
                  {selectedIndex + 1} of {photos.length}
                </span>
              </div>
              {selectedPhoto.caption && (
                <p className="text-sm mt-2">{selectedPhoto.caption}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(selectedPhoto.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

