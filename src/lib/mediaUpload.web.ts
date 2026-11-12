import { supabase } from './supabase';

/** Web: Datei (Blob-Adresse aus der Auswahl) über die Supabase-Storage-Schnittstelle hochladen. */
export async function uploadFile(bucket: string, path: string, uri: string, contentType: string, upsert = false) {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > 50 * 1024 * 1024) throw new Error('Die Datei ist zu groß (höchstens 50 MB).');
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert });
  if (error) throw new Error(`Hochladen fehlgeschlagen: ${error.message}`);
}

/** Web: Standbild aus dem Video holen (erstes Bild nach 0,5 s) */
export async function makeVideoThumb(uri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = uri;
    const fail = () => resolve(null);
    video.onerror = fail;
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, 1));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.7);
    };
    setTimeout(fail, 8000);
  });
}
