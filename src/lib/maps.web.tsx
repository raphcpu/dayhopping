/// <reference types="google.maps" />
// Web-Gegenstück zu react-native-maps auf Basis der Google Maps JavaScript API.
// Unterstützt genau das, was DayHop nutzt: MapView (mit animateToRegion/fitToCoordinates),
// Marker mit eigenem Inhalt und Anker, Circle, Polyline.
import {
  APIProvider, Circle as GCircle, Map, type MapMouseEvent, Marker as GMarker, Polyline as GPolyline, useMap,
} from '@vis.gl/react-google-maps';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { View, type StyleProp, type ViewStyle } from 'react-native';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? '';
// Ohne Map-ID zeichnet Google die klassische Karte – dieselbe Optik wie in der Android-App.
// Eigene Marker liegen deshalb als OverlayView darüber (AdvancedMarker bräuchte eine Map-ID).
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined;

export const PROVIDER_GOOGLE = 'google';

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
type Coord = { nativeEvent: { coordinate: LatLng } };

const toG = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });
/** Zoomstufe wie in der App: Breite des Ausschnitts (Grad) auf die Kartenbreite (Pixel) abbilden */
const zoomFor = (r: { longitudeDelta: number }, widthPx = typeof window !== 'undefined' ? window.innerWidth : 390) =>
  Math.max(2, Math.min(20, Math.log2((360 * widthPx) / 256 / Math.max(r.longitudeDelta, 0.0001))));

// Wie die Android-App: Geschäfte und Werbe-POIs ausblenden, Karte ruhig halten
const STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
];

/** "rgba(r,g,b,a)" oder "#rrggbb" → Farbe + Deckkraft (Google ignoriert Alpha in Farbwerten) */
function color(c: string | undefined, fallback = '#000000'): { color: string; opacity: number } {
  if (!c) return { color: fallback, opacity: 1 };
  const m = /^rgba?\(([^)]+)\)$/.exec(c.replace(/\s/g, ''));
  if (m) {
    const [r, g, b, a] = m[1].split(',').map(Number);
    return { color: `rgb(${r},${g},${b})`, opacity: Number.isFinite(a) ? a : 1 };
  }
  return { color: c, opacity: 1 };
}

export type MapViewHandle = {
  animateToRegion: (r: Region, duration?: number) => void;
  fitToCoordinates: (coords: LatLng[], opts?: { edgePadding?: { top: number; right: number; bottom: number; left: number }; animated?: boolean }) => void;
};

type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  children?: ReactNode;
  onMapReady?: () => void;
  onMapLoaded?: () => void;
  onPress?: (e: Coord) => void;
  onLongPress?: (e: Coord) => void;
  onPoiClick?: (e: { nativeEvent: { coordinate: LatLng; name: string; placeId: string } }) => void;
};

function Bridge({ handle, onReady }: { handle: React.Ref<MapViewHandle>; onReady?: () => void }) {
  const map = useMap();
  useImperativeHandle(handle, () => ({
    animateToRegion: (r) => {
      if (!map) return;
      map.panTo(toG(r));
      map.setZoom(zoomFor(r, map.getDiv().clientWidth || undefined));
    },
    fitToCoordinates: (coords, opts) => {
      if (!map || !coords.length) return;
      const b = new google.maps.LatLngBounds();
      coords.forEach((c) => b.extend(toG(c)));
      map.fitBounds(b, opts?.edgePadding);
    },
  }), [map]);
  const fired = useRef(false);
  useEffect(() => {
    if (map && !fired.current) {
      fired.current = true;
      onReady?.();
    }
  }, [map, onReady]);
  return null;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(props, ref) {
  const { style, initialRegion, children, onMapReady, onMapLoaded, onPress, onLongPress, onPoiClick } = props;
  const center = initialRegion ? toG(initialRegion) : { lat: 51.1657, lng: 10.4515 };
  const zoom = initialRegion ? zoomFor(initialRegion) : 6;

  const onClick = (e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (!ll) return;
    const coordinate = { latitude: ll.lat, longitude: ll.lng };
    if (e.detail.placeId && onPoiClick) {
      e.stop();
      onPoiClick({ nativeEvent: { coordinate, name: '', placeId: e.detail.placeId } });
      return;
    }
    // Im Browser gibt es kein langes Drücken auf der Karte: ein Klick setzt den Punkt
    if (onLongPress && !onPress) onLongPress({ nativeEvent: { coordinate } });
    onPress?.({ nativeEvent: { coordinate } });
  };

  return (
    <View style={style}>
      <APIProvider apiKey={KEY} language="de" region="DE">
        <Map style={{ width: '100%', height: '100%' }} defaultCenter={center} defaultZoom={zoom} mapId={MAP_ID} renderingType="RASTER" styles={MAP_ID ? undefined : STYLES}
          gestureHandling="greedy" disableDefaultUI clickableIcons={!!onPoiClick} onClick={onClick} onTilesLoaded={() => onMapLoaded?.()}>
          <Bridge handle={ref} onReady={onMapReady} />
          {children}
        </Map>
      </APIProvider>
    </View>
  );
});

type MarkerProps = {
  coordinate: LatLng;
  anchor?: { x: number; y: number };
  zIndex?: number;
  title?: string;
  pinColor?: string;
  draggable?: boolean;
  onPress?: () => void;
  onDragEnd?: (e: Coord) => void;
  children?: ReactNode;
};

/** Klassische Stecknadel in Wunschfarbe (für Marker ohne eigenen Inhalt) */
function pinIcon(color = '#EA4335'): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40"><path d="M14 1C7 1 1.5 6.4 1.5 13.3c0 9.2 12.5 25.2 12.5 25.2s12.5-16 12.5-25.2C26.5 6.4 21 1 14 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="4.8" fill="#fff"/></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(28, 40), anchor: new google.maps.Point(14, 39) };
}

function place(div: HTMLDivElement, p: google.maps.Point | null | undefined) {
  if (!p) return;
  div.style.left = `${p.x}px`;
  div.style.top = `${p.y}px`;
}

function configure(div: HTMLDivElement, ax: number, ay: number, zIndex: number | undefined, onPress: (() => void) | undefined) {
  div.style.transform = `translate(${-ax * 100}%, ${-ay * 100}%)`;
  div.style.zIndex = String(zIndex ?? 0);
  div.style.cursor = onPress ? 'pointer' : 'default';
  div.onclick = onPress ? (e) => {
    e.stopPropagation();
    onPress();
  } : null;
}

/** Eigener Marker-Inhalt als HTML über der Karte, positioniert per OverlayView. */
function OverlayMarker({ coordinate, anchor, zIndex, onPress, children }: {
  coordinate: LatLng; anchor: { x: number; y: number }; zIndex?: number; onPress?: () => void; children: ReactNode;
}) {
  const map = useMap();
  const [div] = useState(() => {
    const d = document.createElement('div');
    d.style.position = 'absolute';
    d.style.width = 'max-content';
    return d;
  });
  const overlay = useRef<google.maps.OverlayView | null>(null);
  const pos = useRef(coordinate);

  useEffect(() => {
    if (!map) return;
    const o = new google.maps.OverlayView();
    o.onAdd = () => o.getPanes()?.overlayMouseTarget.appendChild(div);
    o.draw = () => place(div, o.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(pos.current.latitude, pos.current.longitude)));
    o.onRemove = () => div.remove();
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(div);
    o.setMap(map);
    overlay.current = o;
    return () => o.setMap(null);
  }, [map, div]);

  useEffect(() => {
    pos.current = coordinate;
    overlay.current?.draw();
  }, [coordinate]);

  useEffect(() => configure(div, anchor.x, anchor.y, zIndex, onPress), [div, anchor.x, anchor.y, zIndex, onPress]);

  return createPortal(children, div);
}

export function Marker({ coordinate, anchor, zIndex, title, pinColor, draggable, onPress, onDragEnd, children }: MarkerProps) {
  if (children) {
    return <OverlayMarker coordinate={coordinate} anchor={anchor ?? { x: 0.5, y: 0.5 }} zIndex={zIndex} onPress={onPress}>{children}</OverlayMarker>;
  }
  return (
    <GMarker position={toG(coordinate)} zIndex={zIndex} title={title} draggable={draggable} icon={pinIcon(pinColor)}
      onClick={onPress ? () => onPress() : undefined}
      onDragEnd={(e) => {
        const ll = e.latLng;
        if (ll) onDragEnd?.({ nativeEvent: { coordinate: { latitude: ll.lat(), longitude: ll.lng() } } });
      }} />
  );
}

type CircleProps = { center: LatLng; radius: number; strokeColor?: string; strokeWidth?: number; fillColor?: string; zIndex?: number };

export function Circle({ center, radius, strokeColor, strokeWidth = 1, fillColor, zIndex }: CircleProps) {
  const s = color(strokeColor);
  const f = color(fillColor, 'transparent');
  return (
    <GCircle center={toG(center)} radius={radius} zIndex={zIndex} clickable={false}
      strokeColor={s.color} strokeOpacity={strokeColor ? s.opacity : 0} strokeWeight={strokeWidth}
      fillColor={f.color} fillOpacity={fillColor ? f.opacity : 0} />
  );
}

type PolylineProps = { coordinates: LatLng[]; strokeColor?: string; strokeWidth?: number; zIndex?: number };

export function Polyline({ coordinates, strokeColor, strokeWidth = 2, zIndex }: PolylineProps) {
  const s = color(strokeColor);
  return <GPolyline path={coordinates.map(toG)} strokeColor={s.color} strokeOpacity={s.opacity} strokeWeight={strokeWidth} zIndex={zIndex} clickable={false} />;
}

export default MapView;
