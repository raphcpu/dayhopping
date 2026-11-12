// Web: Schlüssel-Wert-Speicher im Browser (localStorage), gleiche Schnittstelle wie storage.ts
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback; // z. B. privater Modus oder gesperrter Speicher
  }
};

export const storage = {
  async getItem(key: string): Promise<string | null> {
    return safe(() => window.localStorage.getItem(key), null);
  },
  async setItem(key: string, value: string): Promise<void> {
    safe(() => window.localStorage.setItem(key, value), undefined);
  },
  async removeItem(key: string): Promise<void> {
    safe(() => window.localStorage.removeItem(key), undefined);
  },
};
