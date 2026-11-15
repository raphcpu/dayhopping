import { useEffect, useState } from 'react';
import { getTrackingMode, onTrackingMode, type TrackingMode } from './trackingMode';

/** Aktueller Ortungsmodus (unterwegs/sparen) für die Anzeige */
export function useTrackingMode(): TrackingMode {
  const [mode, setMode] = useState(getTrackingMode);
  useEffect(() => onTrackingMode(setMode), []);
  return mode;
}
