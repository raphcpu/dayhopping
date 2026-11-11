# Unterlagen für App Store und Google Play

Vorlagen für die Formulare der Stores. Sie beschreiben, was DayHop tatsächlich tut; Wortlaut bei Bedarf anpassen. Für TestFlight und die Weitergabe der APK im Freundeskreis ist nichts davon nötig.

## Google Play: Hintergrund-Ortung

Play Console → App-Inhalte → **Berechtigungen für den Standort**. Das Formular wird auf Englisch geprüft.

**Hauptzweck der App (Kernfunktion)**

> DayHop lets private groups visit several venues together in one day. While a hop is running, each member's live position is shown to the other members of that hop on a shared map, and members are checked in automatically when they arrive at a venue.

**Warum Zugriff im Hintergrund nötig ist**

> Members keep their phone in their pocket while walking between venues. Live location sharing within the group and automatic venue check-ins must keep working while the app is closed or not in use, otherwise members disappear from the group map and arrivals are not registered. Location is only collected while a hop started by the organizer is running and the user has sharing switched on; it stops automatically when the hop ends. Only the latest position is stored, no location history.

**Video (Pflicht, ca. 30 Sekunden, als YouTube-Link)**

1. Hop öffnen, der gerade gestartet wurde.
2. Das Blatt „Standort teilen“ erscheint **vor** der Systemabfrage und zeigt den Hinweis „DayHop erfasst Standortdaten … auch wenn die App geschlossen ist oder nicht verwendet wird“.
3. „Standortzugriff erlauben“ antippen, Systemdialoge zeigen („Beim Verwenden“, danach „Immer zulassen“).
4. Karte mit den Avataren der Gruppe zeigen, App in den Hintergrund legen, Benachrichtigung „DayHop teilt deinen Standort“ zeigen.
5. Auf einem zweiten Gerät zeigen, dass sich der Avatar weiterbewegt und ein Check-in erscheint.

**Dienst im Vordergrund** (App-Inhalte → Berechtigungen für Dienste im Vordergrund): Typ *Standort*, Begründung wie oben, dasselbe Video.

## Google Play: Datensicherheit

| Datentyp | Erhoben | Zweck | Pflicht? |
| --- | --- | --- | --- |
| Genauer Standort | ja | App-Funktionen | optional (abschaltbar) |
| E-Mail-Adresse, Name | ja | App-Funktionen, Kontoverwaltung | Pflicht |
| Fotos und Videos | ja | App-Funktionen | optional |
| Nachrichten in der App | ja | App-Funktionen | optional |
| Sonstige Finanzdaten (eingetragene Ausgaben) | ja | App-Funktionen | optional |
| Geräte-ID (Push-Kennung) | ja | App-Funktionen | optional |

- Keine Weitergabe zu Werbe- oder Analysezwecken, keine Werbung.
- Daten werden bei der Übertragung verschlüsselt (HTTPS).
- Nutzer können die Löschung verlangen: in der App unter **Profil → Konto löschen**. Google verlangt zusätzlich eine Web-Adresse dafür: `docs/datenschutz.md` veröffentlichen (z. B. als GitHub-Seite) und dort die Kontakt-E-Mail nennen.
- Zielgruppe: ab 16 Jahren.

## Apple: App-Datenschutz („Privacy Nutrition Label“)

Alle Punkte: **mit der Identität verknüpft**, **nicht zum Tracking verwendet**, Zweck **App-Funktionalität**.

- Kontaktinformationen: E-Mail-Adresse, Name
- Standort: Genauer Standort
- Benutzerinhalte: Fotos oder Videos, sonstige Benutzerinhalte (Nachrichten, Ausgaben)
- Kennungen: Geräte-ID (Push-Kennung)

## Apple: Hinweise für die Prüfung (App Review Notes)

> DayHop is used by private groups; content is only visible to members of the same hop (invite code required).
>
> Demo account: [E-Mail] / [Passwort]. The account is a member of a running hop with stations in [Stadt]. Invite code for a second device: [Code].
>
> Background location (UIBackgroundModes: location): while a hop is running, members share their live position with the group and are checked in automatically at venues, also with the phone locked. An in-app explanation is shown before the system permission prompt (Map tab → "Standort teilen"). Sharing can be paused per hop at any time and stops when the hop ends.
>
> User-generated content (Guideline 1.2): users accept the rules at sign-up (Login → "Datenschutzerklärung und Nutzungsregeln"). Messages, photos and videos can be reported (long-press a message / flag icon in the photo viewer); reports go to the organizers of the hop, who can delete content and remove members. Users can block other users (same menus; managed under Profile). Contact: [E-Mail].
>
> Account deletion (Guideline 5.1.1(v)): Profile → "Konto löschen".

## Vor dem Einreichen

- [ ] Betreiberangaben in `.env` (`EXPO_PUBLIC_LEGAL_*`) eingetragen, `npm run legal:export` ausgeführt, Datenschutzerklärung rechtlich geprüft und unter einer öffentlichen Adresse erreichbar
- [ ] Eigene App-Kennung (`APP_IDENTIFIER`) und eigener Signaturschlüssel
- [ ] Demo-Konto mit laufendem Hop für die Prüfer angelegt
- [ ] Eigenes App-Symbol und Screenshots
- [ ] Auf echten Geräten getestet: Ortung im Hintergrund, Push, Uploads, Konto löschen
