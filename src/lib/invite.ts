import { CONFIRM_REDIRECT } from './supabase';
import { storage } from './storage';

const KEY = 'dayhop:einladung';

/** Einladungslink zum Scannen/Teilen. Öffnet die Browser-Version und tritt dem Hop bei. */
export const inviteUrl = (code: string) => `${CONFIRM_REDIRECT}join/${code}`;

/** Code merken, wenn man sich erst noch anmelden/registrieren muss */
export const rememberInvite = (code: string) => storage.setItem(KEY, code.toUpperCase());

/** Gemerkten Code einmalig abholen */
export async function takePendingInvite(): Promise<string | null> {
  const code = await storage.getItem(KEY);
  if (code) await storage.removeItem(KEY);
  return code;
}
