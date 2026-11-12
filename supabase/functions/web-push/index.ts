// Verschickt Web-Push-Mitteilungen (Browser/iPhone-PWA) aus der Warteschlange web_push_outbox.
// Wird von send_push() angestoßen. Der Aufruf selbst trägt keine Daten: Wer die Funktion
// aufruft, kann nur die ohnehin wartenden Mitteilungen abschicken lassen.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Row = { id: number; token: string; payload: { title: string; body: string; data?: Record<string, unknown> } };

let configured = false;

Deno.serve(async () => {
  if (!configured) {
    const { data, error } = await db.rpc('web_push_config').single<{ public_key: string; private_key: string; subject: string }>();
    if (error || !data) return new Response('Keine VAPID-Konfiguration', { status: 500 });
    webpush.setVapidDetails(data.subject, data.public_key, data.private_key);
    configured = true;
  }

  let sent = 0;
  let gone = 0;
  for (let i = 0; i < 10; i++) {
    const { data: rows, error } = await db.rpc('web_push_take', { p_limit: 200 });
    if (error) return new Response(error.message, { status: 500 });
    if (!rows?.length) break;
    await Promise.all((rows as Row[]).map(async (r) => {
      try {
        await webpush.sendNotification(JSON.parse(r.token), JSON.stringify(r.payload), { TTL: 6 * 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Abo abgelaufen oder abgemeldet: aus der Datenbank entfernen
        if (status === 404 || status === 410) {
          gone++;
          await db.from('push_tokens').delete().eq('token', r.token);
        }
      }
    }));
  }
  return Response.json({ sent, gone });
});
