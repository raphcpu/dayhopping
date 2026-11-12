/// <reference types="google.maps" />
// Web-Gegenstück zu react-native-maps auf Basis der Google Maps JavaScript API.
// Unterstützt genau das, was DayHop nutzt: MapView (mit animateToRegion/fitToCoordinates),
// Marker mit eigenem Inhalt und Anker, Circle, Polyline.
import {
  AdvancedMarker, APIProvider, Circle as GCircle, Map, type MapMouseEvent, Pin, Polyline as GPolyline, useMap,
} from '@vis.gl/react-google-maps';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY ?? '';
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

export const PROVIDER_GOOGLE = 'google';

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
type Coord = { nativeEvent: { coordinate: LatLng } };

const toG = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });
const zoomFor = (delta: number) => Math.max(2, Math.min(20, Math.round(Math.log2(360 / Math.max(delta, 0.0001)))));

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
      map.setZoom(zoomFor(r.latitudeDelta));
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
  const zoom = initialRegion ? zoomFor(initialRegion.latitudeDelta) : 6;

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
        <Map style={{ width: '100%', height: '100%' }} defaultCenter={center} defaultZoom={zoom} mapId={MAP_ID}
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

export function Marker({ coordinate, anchor, zIndex, title, pinColor, draggable, onPress, onDragEnd, children }: MarkerProps) {
  const a = anchor ?? (children ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 });
  return (
    <AdvancedMarker position={toG(coordinate)} zIndex={zIndex} title={title} draggable={draggable}
      anchorLeft={`${-a.x * 100}%`} anchorTop={`${-a.y * 100}%`}
      onClick={onPress ? () => onPress() : undefined}
      onDragEnd={(e) => {
        const ll = e.latLng;
        if (ll) onDragEnd?.({ nativeEvent: { coordinate: { latitude: ll.lat(), longitude: ll.lng() } } });
      }}>
      {children ?? <Pin background={pinColor} borderColor="#ffffff" glyphColor="#ffffff" />}
    </AdvancedMarker>
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
