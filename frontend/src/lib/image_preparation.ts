// What the browser does to a picked file before it leaves: thumbnails for the shelf, metadata stripping for direct
// bucket uploads (the server never sees those), and spotting animations (the editor would flatten them).
import { isVideoContentType, thumbnailEdgePixels } from "@/lib/media_upload_types"

// Draws a video's first frame for the shelf thumbnail.
function decodeFirstVideoFrame(videoFile: Blob): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const videoElement = document.createElement("video")
    videoElement.muted = true
    videoElement.playsInline = true
    videoElement.preload = "metadata"
    videoElement.src = URL.createObjectURL(videoFile)
    videoElement.addEventListener("loadeddata", () => {
      createImageBitmap(videoElement)
        .then(resolve, reject)
        .finally(() => URL.revokeObjectURL(videoElement.src))
    })
    videoElement.addEventListener("error", () => reject(new Error("video decode failed")))
  })
}

export async function createThumbnailBlob(mediaFile: Blob): Promise<Blob | null> {
  const bitmap = isVideoContentType(mediaFile.type) ? await decodeFirstVideoFrame(mediaFile) : await createImageBitmap(mediaFile)
  const scale = Math.min(1, thumbnailEdgePixels / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.76))
}

// Redraws a still so EXIF, GPS and other metadata never leave the browser (direct bucket uploads only).
export async function stripStillImageMetadata(imageFile: File): Promise<Blob> {
  const bitmap = await createImageBitmap(imageFile)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  bitmap.close()
  const encodingQuality = imageFile.type === "image/png" ? undefined : 0.92
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not re-encode"))), imageFile.type, encodingQuality),
  )
}

// GIFs count as animated; a WebP is animated when its header carries an ANIM chunk.
export async function isAnimatedImage(imageFile: File): Promise<boolean> {
  if (imageFile.type === "image/gif") return true
  if (imageFile.type !== "image/webp") return false
  const headerBytes = new Uint8Array(await imageFile.slice(0, 64).arrayBuffer())
  return headerBytes.some(
    (headerByte, byteIndex) =>
      headerByte === 0x41 && headerBytes[byteIndex + 1] === 0x4e && headerBytes[byteIndex + 2] === 0x49 && headerBytes[byteIndex + 3] === 0x4d,
  )
}
