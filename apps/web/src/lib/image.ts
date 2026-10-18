/** Read the pixel size of an image blob; undefined when it cannot be decoded. */
export function imageDimensions(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  if (!blob.type.startsWith("image/") || typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}
