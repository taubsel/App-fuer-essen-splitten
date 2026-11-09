"use client";

/** Verkleinert ein Foto im Browser (spart mobiles Datenvolumen und bleibt unter dem Upload-Limit). */
export async function downscaleImage(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function imagesToForm(files: File[], field = "images"): Promise<FormData> {
  const form = new FormData();
  for (const f of files) {
    const blob = await downscaleImage(f);
    form.append(field, blob, f.name.replace(/\.\w+$/, "") + ".jpg");
  }
  return form;
}
