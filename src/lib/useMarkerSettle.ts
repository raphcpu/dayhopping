import { useEffect, useState } from 'react';

/**
 * Google Maps auf Android macht von eigenen Markern ein Bild. Passiert das, bevor Text
 * (z. B. die Stationsnummer) gezeichnet ist, oder ändert sich der Inhalt danach (Nummer,
 * Größe, Haken), fehlt er bzw. bleibt veraltet. Deshalb nach dem Erscheinen und nach jeder
 * Änderung von `key` ein paar Sekunden weiter aktualisieren, danach einfrieren (spart Akku).
 */
export function useMarkerSettle(key: string | number = '', ms = 4000): boolean {
  const [settledKey, setSettledKey] = useState<string | number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(key), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return settledKey !== key;
}
