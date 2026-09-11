function rawFileToDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Downscales uploaded artwork before it enters campaign state. Audio, SVGs, and
 * animated GIFs are kept byte-for-byte; large raster images become compact WebP.
 */
export async function fileToDataURL(file: File): Promise<string> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return rawFileToDataURL(file);
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 2048;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86)
    );
    if (!blob) throw new Error("Image conversion failed");
    if (scale === 1 && blob.size >= file.size) return rawFileToDataURL(file);
    return rawFileToDataURL(blob);
  } catch {
    return rawFileToDataURL(file);
  }
}

export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}
