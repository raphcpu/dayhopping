import * as ImagePicker from 'expo-image-picker';
import { makeVideoThumb, uploadFile } from './mediaUpload';
import { supabase } from './supabase';

const MAX_BYTES = 50 * 1024 * 1024; // Grenze im kostenlosen Supabase-Tarif

const randomName = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function pickFromLibrary(): Promise<ImagePicker.ImagePickerAsset[]> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: 12,
    quality: 0.7,
    videoMaxDuration: 90,
  });
  return r.canceled ? [] : r.assets;
}

export async function takeWithCamera(video: boolean): Promise<ImagePicker.ImagePickerAsset[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Ohne Kamerazugriff geht das nicht. Du kannst ihn in den Einstellungen erlauben.');
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: video ? ['videos'] : ['images'],
    quality: 0.7,
    videoMaxDuration: 60,
  });
  return r.canceled ? [] : r.assets;
}

/** Lädt ein Foto oder Video in die Collage der Runde. */
export async function uploadToCollage(roundId: string, userId: string, stationId: string | null, asset: ImagePicker.ImagePickerAsset) {
  const isVideo = asset.type === 'video';
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw new Error('Die Datei ist größer als 50 MB.');
  const ext = isVideo ? (asset.uri.toLowerCase().endsWith('.mov') || asset.mimeType === 'video/quicktime' ? 'mov' : 'mp4') : asset.mimeType === 'image/png' ? 'png' : 'jpg';
  const base = `${roundId}/${userId}/${randomName()}`;
  const path = `${base}.${ext}`;
  await uploadFile('media', path, asset.uri, asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'));

  let thumbPath: string | null = null;
  if (isVideo) {
    try {
      const thumbUri = await makeVideoThumb(asset.uri);
      if (thumbUri) {
        thumbPath = `${base}-vorschau.jpg`;
        await uploadFile('media', thumbPath, thumbUri, 'image/jpeg');
      }
    } catch {
      thumbPath = null; // Vorschau ist nur Kür
    }
  }

  const { error } = await supabase.from('media').insert({
    round_id: roundId,
    user_id: userId,
    station_id: stationId,
    kind: isVideo ? 'video' : 'photo',
    storage_path: path,
    thumb_path: thumbPath,
    width: asset.width || null,
    height: asset.height || null,
    duration_ms: asset.duration ? Math.round(asset.duration) : null,
  });
  if (error) {
    await supabase.storage.from('media').remove([path, ...(thumbPath ? [thumbPath] : [])]);
    throw error;
  }
}

export async function deleteMedia(m: { id: string; storage_path: string; thumb_path: string | null }) {
  const { error } = await supabase.from('media').delete().eq('id', m.id);
  if (error) throw error;
  await supabase.storage.from('media').remove([m.storage_path, ...(m.thumb_path ? [m.thumb_path] : [])]);
}

export async function uploadAvatar(userId: string): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
  if (r.canceled) return null;
  const path = `${userId}/${randomName()}.jpg`;
  await uploadFile('avatars', path, r.assets[0].uri, 'image/jpeg');
  return path;
}

// Die Collage ist privat: Dateien sind nur über kurzlebige, signierte Adressen abrufbar.
const signed = new Map<string, { url: string; expires: number }>();

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const missing = [...new Set(paths)].filter((p) => (signed.get(p)?.expires ?? 0) < now + 60_000);
  if (missing.length) {
    const { data } = await supabase.storage.from('media').createSignedUrls(missing, 6 * 3600);
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) signed.set(d.path, { url: d.signedUrl, expires: now + 6 * 3600_000 });
    }
  }
  const out: Record<string, string> = {};
  for (const p of paths) {
    const hit = signed.get(p);
    if (hit) out[p] = hit.url;
  }
  return out;
}
