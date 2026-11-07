"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import { guessCategory, MAX_UPLOAD_MB, storagePathFor } from "./assets";
import type { AssetRow } from "./model";

export const ASSET_BUCKET = "brand-assets";

async function imageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith("image/")) return { width: null, height: null };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth || null, height: img.naturalHeight || null };
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Uploads a file straight from the browser to the brand's private storage
 * folder. Storage policies only accept it if the signed-in user can edit the
 * brand. Returns the asset row to save, and a short-lived URL to show it.
 */
export async function uploadAsset(
  brandId: string,
  file: File,
  limitMb = MAX_UPLOAD_MB,
): Promise<{ row: AssetRow; url: string | null }> {
  const max = Math.min(limitMb, MAX_UPLOAD_MB);
  if (file.size > max * 1024 * 1024) {
    throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${max} MB.`);
  }
  const id = crypto.randomUUID();
  const path = storagePathFor(brandId, id, file.name);
  const mime = file.type || (/\.woff2$/i.test(file.name) ? "font/woff2" : /\.woff$/i.test(file.name) ? "font/woff" : /\.ttf$/i.test(file.name) ? "font/ttf" : /\.otf$/i.test(file.name) ? "font/otf" : "application/octet-stream");

  const supabase = supabaseBrowser();
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: mime, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Couldn't upload ${file.name}: ${error.message}`);

  const { width, height } = await imageSize(file);
  const { data: signed } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, 60 * 60 * 6);
  return {
    row: {
      id,
      category: guessCategory(file),
      name: file.name.slice(0, 200),
      storage_path: path,
      mime,
      size: file.size,
      width,
      height,
      client_visible: false,
    },
    url: signed?.signedUrl ?? null,
  };
}
