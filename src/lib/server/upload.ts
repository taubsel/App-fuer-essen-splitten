import "server-only";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http";
import { supabaseAdmin } from "./supabase-admin";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function readImages(req: Request, field = "images", max = 4): Promise<File[]> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Kein Foto empfangen");
  }
  const files = form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new HttpError(400, "Kein Foto empfangen");
  if (files.length > max) throw new HttpError(400, `Maximal ${max} Fotos`);
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new HttpError(413, "Foto ist zu groß (max. 4 MB)");
    if (f.type && !TYPES.includes(f.type)) throw new HttpError(415, "Bitte ein Foto (JPG/PNG) hochladen");
  }
  return files;
}


export async function storeImage(sessionId: string, prefix: string, file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${sessionId}/${prefix}-${randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin()
    .storage.from("photos")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return path;
}
