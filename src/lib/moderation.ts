import { showAlert } from '@/lib/alert';

import { showMenu } from '@/components/Menu';
import { errorText } from './format';
import { supabase } from './supabase';

const REASONS = ['Beleidigung oder Belästigung', 'Anstößiger oder verbotener Inhalt', 'Spam', 'Etwas anderes'];

type Target = { roundId: string; kind: 'message' | 'media' | 'user'; id: string; userId: string | null; excerpt: string };

/** Fragt nach dem Grund und schickt die Meldung an die Organisation des Hops. */
export function reportContent(target: Target) {
  showMenu({
    title: 'Warum meldest du das?',
    message: 'Die Meldung geht an die Organisation dieses Hops.',
    options: REASONS.map((reason) => ({
      text: reason,
      onPress: async () => {
        const { error } = await supabase.from('reports').insert({
          round_id: target.roundId, target_kind: target.kind, target_id: target.id, target_user: target.userId,
          excerpt: target.excerpt.slice(0, 300), reason,
        });
        if (error && error.code !== '23505') return showAlert('Das hat nicht geklappt', errorText(error));
        showAlert(error ? 'Schon gemeldet' : 'Danke, gemeldet', error ? 'Das hast du bereits gemeldet.' : 'Die Organisation sieht sich das an.');
      },
    })),
  });
}

/** Bestätigung vor dem Blockieren. */
export function confirmBlock(name: string, block: () => Promise<void>) {
  showAlert(`${name} blockieren?`, 'Du siehst dann keine Chat-Nachrichten, Fotos und Videos dieser Person mehr und bekommst keine Benachrichtigungen von ihr. Durchsagen der Organisation siehst du weiterhin. Aufheben kannst du das im Profil.', [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Blockieren', style: 'destructive', onPress: () => block().catch((e) => showAlert('Das hat nicht geklappt', errorText(e))) },
  ]);
}
