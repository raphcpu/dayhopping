// Datenschutzerklärung und Nutzungsregeln. Eine Quelle für den Bildschirm in der
// App und für docs/datenschutz.md (npm run legal:export).
// ENTWURF: beschreibt, was die App technisch tut. Vor einer Veröffentlichung
// bitte rechtlich prüfen lassen und die Angaben zum Betreiber in .env eintragen.

export const operator = {
  name: process.env.EXPO_PUBLIC_LEGAL_NAME || '',
  address: process.env.EXPO_PUBLIC_LEGAL_ADDRESS || '',
  email: process.env.EXPO_PUBLIC_LEGAL_EMAIL || '',
  hostingRegion: process.env.EXPO_PUBLIC_LEGAL_HOSTING_REGION || '',
};

export const operatorComplete = Boolean(operator.name && operator.address && operator.email);
export const LEGAL_VERSION = 'Stand: November 2026';

export type LegalSection = { title: string; paragraphs: string[] };

export function privacySections(): LegalSection[] {
  const name = operator.name || '[Name des Betreibers eintragen]';
  const address = operator.address || '[Anschrift eintragen]';
  const email = operator.email || '[E-Mail-Adresse eintragen]';
  const region = operator.hostingRegion ? ` Die Daten liegen in der Region ${operator.hostingRegion}.` : '';
  return [
    {
      title: '1. Wer ist verantwortlich?',
      paragraphs: [
        `Verantwortlich für die Datenverarbeitung in DayHop ist: ${name}, ${address}. Kontakt: ${email}.`,
      ],
    },
    {
      title: '2. Welche Daten verarbeitet DayHop?',
      paragraphs: [
        'Konto: deine E-Mail-Adresse, dein Passwort (nur als nicht umkehrbarer Hash), dein Anzeigename, deine Farbe und, wenn du eines hochlädst, dein Profilbild.',
        'Hops: in welchen Hops du Mitglied bist, deine Rolle, die Stationen und deine Einstellungen (Standort teilen, Chat stumm).',
        'Standort: deine jeweils letzte Position mit Genauigkeit, Richtung, Geschwindigkeit und Zeitpunkt. Das geschieht, solange du Mitglied eines Hops bist und dort das Teilen eingeschaltet hast – auch, wenn die App geschlossen ist oder nicht verwendet wird. Ein Bewegungsverlauf wird nicht gespeichert.',
        'Check-ins: an welcher Station du wann angekommen und wieder gegangen bist.',
        'Inhalte: deine Chat-Nachrichten und Durchsagen, eingetragene Ausgaben und Ausgleichszahlungen sowie Fotos und Videos, die du in die Collage lädst.',
        'Gerät: eine Push-Kennung deines Geräts, damit Benachrichtigungen ankommen.',
        'Meldungen und Blockierungen: wenn du einen Inhalt meldest oder eine Person blockierst.',
        'Technische Daten: Beim Abruf fallen bei den eingesetzten Dienstleistern übliche Verbindungsdaten an (z. B. IP-Adresse, Zeitpunkt).',
      ],
    },
    {
      title: '3. Wofür und auf welcher Grundlage?',
      paragraphs: [
        'Konto, Hops, Check-ins, Chat, Kosten, Collage und Push verarbeiten wir, um dir die Funktionen der App bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO).',
        'Deinen Standort verarbeiten wir nur mit deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Du erteilst sie über die Standortfreigabe deines Geräts und kannst sie jederzeit widerrufen: in der App unter „Standort teilen“ pausieren oder die Berechtigung in den Geräteeinstellungen entziehen.',
        'Meldungen verarbeiten wir, um Missbrauch zu unterbinden (Art. 6 Abs. 1 lit. f DSGVO).',
        'DayHop enthält keine Werbung und kein Tracking zu Analyse- oder Werbezwecken.',
      ],
    },
    {
      title: '4. Wer sieht deine Daten?',
      paragraphs: [
        'Alles ist rundenprivat: Name, Profilbild, Standort, Check-ins, Nachrichten, Ausgaben, Fotos und Videos sehen ausschließlich die Mitglieder des jeweiligen Hops. Wer den Einladungscode nicht hat, hat keinen Zugriff.',
        'Meldungen sehen die Organisatorinnen und Organisatoren des betroffenen Hops.',
      ],
    },
    {
      title: '5. Dienstleister',
      paragraphs: [
        `Supabase (Supabase Inc.) speichert Datenbank, Anmeldung und Dateien in unserem Auftrag.${region}`,
        'Expo (650 Industries, Inc., USA) sowie Apple und Google stellen Push-Benachrichtigungen zu. Dabei werden Push-Kennung, Titel und Text der Benachrichtigung übermittelt.',
        'Google Maps (Google Ireland Ltd. bzw. Google LLC) stellt die Karte dar. Google erhält dabei technische Daten wie deine IP-Adresse und den angezeigten Kartenausschnitt.',
        'Soweit Daten in die USA übermittelt werden, geschieht das auf Grundlage des EU-US-Datenschutzrahmens bzw. der Standardvertragsklauseln der EU-Kommission.',
      ],
    },
    {
      title: '6. Wie lange werden die Daten gespeichert?',
      paragraphs: [
        'Standort: bis du das Teilen pausierst, den Hop verlässt oder er gelöscht wird – dann wird deine Position gelöscht.',
        'Check-ins, Nachrichten, Ausgaben, Fotos und Videos: bis du sie löschst, die Organisation den Hop löscht oder du dein Konto löschst.',
        'Konto: bis du es löschst (Profil → Konto löschen). Dabei werden Anmeldedaten, Name, Profilbild, Nachrichten, Fotos, Videos, Check-ins und Standort gelöscht. Ausgaben, an denen andere beteiligt sind, bleiben für deren Abrechnung ohne deinen Namen unter „Gelöschtes Konto“ bestehen.',
      ],
    },
    {
      title: '7. Deine Rechte',
      paragraphs: [
        `Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, eine Einwilligung jederzeit zu widerrufen. Schreib dazu an ${email}.`,
        'Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren.',
      ],
    },
    {
      title: '8. Mindestalter',
      paragraphs: ['DayHop richtet sich an Personen ab 16 Jahren.'],
    },
  ];
}

export function rulesSections(): LegalSection[] {
  const email = operator.email || '[E-Mail-Adresse eintragen]';
  return [
    {
      title: 'Nutzungsregeln',
      paragraphs: [
        'DayHop ist für Gruppen gedacht, die sich kennen. Trotzdem gilt: keine Beleidigungen, keine Belästigung, keine Drohungen, keine rechtswidrigen, pornografischen oder gewaltverherrlichenden Inhalte, keine Fotos oder Videos von Personen gegen deren Willen.',
        'Jede Nachricht, jedes Foto und jedes Video kannst du melden (lange drücken bzw. Fahnen-Symbol). Meldungen gehen an die Organisation des Hops, die Inhalte löschen und Personen entfernen kann.',
        'Du kannst Personen blockieren. Ihre Chat-Nachrichten, Fotos und Videos siehst du dann nicht mehr und bekommst von ihnen keine Benachrichtigungen. Durchsagen der Organisation siehst du weiterhin.',
        `Bei schweren Verstößen oder wenn die Organisation nicht reagiert, schreib an ${email}. Konten, die gegen diese Regeln verstoßen, können gesperrt werden.`,
      ],
    },
  ];
}
