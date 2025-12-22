'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, Image as ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InboxV2PhotoCaptureProps {
  onPhotoCapture: (file: File) => void
  onPhotoSelect: (file: File) => void
  className?: string
}

/**
 * One-tap photo capture and attach for mobile
 * Critical for roofers to request/receive damage pics
 */
export function InboxV2PhotoCapture({
  onPhotoCapture,
  onPhotoSelect,
  className,
}: InboxV2PhotoCaptureProps) {
  const [showOptions, setShowOptions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleTakePhoto = () => {
    cameraInputRef.current?.click()
  }

  const handleSelectFromGallery = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isCamera: boolean) => {
    const file = e.target.files?.[0]
    if (file) {
      if (isCamera) {
        onPhotoCapture(file)
      } else {
        onPhotoSelect(file)
      }
      setShowOptions(false)
    }
  }

  return (
    <>
      {/* Main Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowOptions(!showOptions)}
        className={cn('md:hidden', className)}
      >
        <Camera className="w-4 h-4 mr-1" />
        Photo
      </Button>

      {/* Options Menu */}
      {showOptions && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
            onClick={() => setShowOptions(false)}
          />

          {/* Options */}
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-lg z-50 md:hidden p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Add Photo</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowOptions(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-20 flex flex-col gap-2"
                onClick={handleTakePhoto}
              >
                <Camera className="w-6 h-6" />
                <span className="text-xs">Take Photo</span>
              </Button>

              <Button
                variant="outline"
                className="h-20 flex flex-col gap-2"
                onClick={handleSelectFromGallery}
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-xs">From Gallery</span>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Hidden Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e, true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileChange(e, false)}
      />
    </>
  )
}



















































