import { useEffect, useState } from 'react';

/**
 * Google Maps auf Android macht von eigenen Markern ein Bild. Passiert das, bevor Text
 * (z. B. die Stationsnummer) gezeichnet ist, fehlt er. Deshalb die ersten Sekunden nach
 * dem Erscheinen weiter aktualisieren, danach einfrieren (spart Akku).
 */
export function useMarkerSettle(ms = 2000): boolean {
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSettling(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return settling;
}
