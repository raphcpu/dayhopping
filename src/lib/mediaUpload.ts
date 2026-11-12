import { File, UploadType } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

/** Lädt eine lokale Datei direkt vom Gerätespeicher hoch, ohne sie komplett in den Arbeitsspeicher zu holen. */
export async function uploadFile(bucket: string, path: string, uri: string, contentType: string, upsert = false) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Nicht angemeldet');
  const res = await new File(uri).upload(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': contentType,
      'x-upsert': upsert ? 'true' : 'false',
    },
  });
  if (res.status === 413) throw new Error('Die Datei ist zu groß (höchstens 50 MB).');
  if (res.status === 401 || res.status === 403) throw new Error('Keine Berechtigung zum Hochladen. Melde dich ab und wieder an.');
  if (res.status < 200 || res.status >= 300) throw new Error(`Hochladen fehlgeschlagen (Fehler ${res.status}). Prüf deine Verbindung.`);
}

/** Vorschaubild eines Videos als lokale Datei, oder null */
export async function makeVideoThumb(uri: string): Promise<string | null> {
  const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.6 });
  return thumb.uri;
}
