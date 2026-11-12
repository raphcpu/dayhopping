import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let currentToken: string | null = null;

/** Meldet dieses Gerät für Push an. Gibt false zurück, wenn es nicht geht (Simulator, abgelehnt). */
export async function registerForPush(): Promise<boolean> {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Nachrichten & Durchsagen',
      // eslint-disable-next-line import/namespace -- wird über "export *" bereitgestellt
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#5B3DF5',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false;
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    currentToken = token;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    return !error;
  } catch {
    return false;
  }
}

/** Vor dem Abmelden aufrufen, damit dieses Gerät keine Pushes mehr bekommt. */
export async function unregisterPush() {
  if (currentToken) await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

export type PushData = { roundId?: string; type?: 'chat' | 'announcement' | 'expense' | 'status' | 'report' };

/** Tippen auf eine Benachrichtigung öffnet den passenden Tab. */
export function onPushTap(handler: (data: PushData) => void): () => void {
  const handle = (r: Notifications.NotificationResponse | null) => {
    if (r) handler(r.notification.request.content.data as PushData);
  };
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

// Nur im Browser relevant (siehe push.web.ts); in der App kümmert sich das System darum.
export type WebPushState = 'aktiv' | 'moeglich' | 'abgelehnt' | 'installieren' | 'nicht-unterstuetzt';
export const webPushState = (): WebPushState | null => null;
export const enableWebPush = async (): Promise<WebPushState | null> => null;
