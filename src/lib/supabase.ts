import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { storage } from './storage';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
/** Hierhin führt der Bestätigungslink aus der E-Mail (Browser-Version; meldet direkt an) */
export const CONFIRM_REDIRECT = process.env.EXPO_PUBLIC_WEB_URL || 'https://raphcpu.github.io/dayhopping/';
export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export const supabase = createClient(SUPABASE_URL || 'https://nicht-konfiguriert.supabase.co', SUPABASE_ANON_KEY || 'x', {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
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
