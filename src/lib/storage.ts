// Kleiner Schlüssel-Wert-Speicher auf Basis einzelner Dateien im App-Ordner.
// Ersetzt AsyncStorage: Dessen SQLite-Datenbank ließ sich auf manchen Geräten
// (nachgestellt: Android 16) nicht öffnen, und der Fehler beendete die App sofort.
// Hier landet jeder Fehler als normale JavaScript-Ausnahme und wird abgefangen.
import { Directory, File, Paths } from 'expo-file-system';

const cache = new Map<string, string | null>();
let dir: Directory | null = null;

function folder(): Directory {
  if (!dir) {
    dir = new Directory(Paths.document, 'speicher');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

const fileFor = (key: string) => new File(folder(), `${encodeURIComponent(key)}.txt`);

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (cache.has(key)) return cache.get(key) ?? null;
    try {
      const f = fileFor(key);
      const value = f.exists ? await f.text() : null;
      cache.set(key, value);
      return value;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    cache.set(key, value);
    try {
      const f = fileFor(key);
      if (!f.exists) f.create({ overwrite: true });
      f.write(value);
    } catch {
      // nur im Arbeitsspeicher behalten; nächster Start beginnt dann ohne diesen Wert
    }
  },
  async removeItem(key: string): Promise<void> {
    cache.set(key, null);
    try {
      const f = fileFor(key);
      if (f.exists) f.delete();
    } catch {
      // egal
    }
  },
};
