import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export const supabase = createClient(SUPABASE_URL || 'https://nicht-konfiguriert.supabase.co', SUPABASE_ANON_KEY || 'x', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Token nur erneuern, solange die App sichtbar ist. Im Hintergrund holt sich
// die Ortung bei Bedarf selbst eine frische Sitzung (getSession).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export function avatarUrl(path: string | null): string | null {
  return path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;
}
