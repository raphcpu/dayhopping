# DayHop

Deutschsprachige App für private Gruppen, die an einem Tag gemeinsam mehrere Stationen besuchen: Route auf Google Maps, Live-Standorte, automatische Check-ins, Gruppenchat mit Durchsagen, centgenaue Kostenaufteilung, private Foto-/Video-Collage, Push, PDF-/CSV-Export und ein Organisator-Dashboard.

**Technik:** Expo SDK 58 (React Native, TypeScript, Expo Router) und Supabase (Postgres, Auth, Realtime, Storage). Push läuft über den Expo-Push-Dienst, angestoßen direkt aus der Datenbank.

**Warum native App statt PWA?** Eine Web-App darf im Hintergrund nicht orten. Durchgehendes Live-Tracking und Check-ins bei gesperrtem Handy gehen nur nativ.

## Einrichten

Du brauchst Node 20+, ein Expo-Konto, ein Supabase-Projekt und einen Google-Cloud-Schlüssel für Maps.

### 1. Supabase

1. Neues Projekt auf supabase.com anlegen.
2. **SQL Editor** öffnen, den kompletten Inhalt von `supabase/schema.sql` einfügen und ausführen. Das legt Tabellen, Zugriffsregeln, Funktionen, Realtime und die beiden Storage-Buckets an. (Wer schon die erste Fassung ausgeführt hat, führt stattdessen einmal `supabase/update-von-version-1.sql` aus.)
3. **Authentication → Sign In / Providers → Email:** Für eine private Gruppe am einfachsten „Confirm email“ ausschalten. Bleibt es an, müssen neue Leute erst den Link in der Bestätigungsmail anklicken; der eingebaute Mailversand von Supabase ist stark begrenzt, dafür dann eigenen SMTP-Zugang hinterlegen.
4. Unter **Project Settings → API** die Projekt-URL und den `anon`-Schlüssel kopieren.

### 2. Google Maps

In der Google Cloud Console ein Projekt anlegen, **Maps SDK for Android** und **Maps SDK for iOS** aktivieren und einen API-Schlüssel erzeugen. Schlüssel am besten auf die App-Kennung beschränken.

### 3. Projekt

```bash
npm install
cp .env.example .env      # Werte eintragen
npx eas-cli@latest login
npx eas-cli@latest init   # vergibt die EAS_PROJECT_ID → in .env eintragen
```

Die App-Kennung steht in `app.config.ts` (`de.dayhop.app`). Vor dem ersten Build über `APP_IDENTIFIER` in `.env` auf eine eigene ändern.

Damit die Werte auch im Cloud-Build ankommen, einmal hinterlegen:

```bash
npx eas-cli@latest env:create --environment production --name GOOGLE_MAPS_API_KEY --value ...
# ebenso: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EAS_PROJECT_ID, ggf. APP_IDENTIFIER
```

(Für die Profile `preview` und `development` entsprechend wiederholen.)

### 4. Bauen und verteilen

**Android-APK ohne Expo-Konto (GitHub Actions).** Projekt in ein GitHub-Repository legen, unter *Settings → Secrets and variables → Actions* die drei Secrets `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` und `GOOGLE_MAPS_API_KEY` anlegen, dann *Actions → Android-APK bauen → Run workflow*. Nach etwa 20–30 Minuten liegt die APK unter *Artifacts*. Details und optionale Secrets stehen oben in `.github/workflows/apk.yml`.

Für die Weitergabe an die Gruppe einen eigenen Signaturschlüssel hinterlegen, sonst wird mit dem öffentlichen Test-Schlüssel signiert:

```bash
keytool -genkeypair -v -keystore dayhop.keystore -alias dayhop -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 dayhop.keystore   # Ausgabe als Secret ANDROID_KEYSTORE_BASE64, dazu ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
```

Den Schlüssel gut aufbewahren: Updates lassen sich nur mit demselben Schlüssel über die alte Version installieren.

**Auf dem eigenen Rechner** (Android Studio installiert): `scripts/build-apk.sh`.

**Mit EAS** (Expo-Cloud), auch für iOS:

Die App läuft **nicht in Expo Go** (Karten, Hintergrund-Ortung und Push brauchen einen eigenen Build).

| Ziel | Befehl | Verteilung |
| --- | --- | --- |
| Entwickeln | `npx eas-cli@latest build --profile development --platform all`, danach `npx expo start` | Entwicklungs-Build aufs eigene Gerät |
| Android für die Gruppe | `npx eas-cli@latest build --profile preview --platform android` | APK-Link/QR-Code weitergeben, kein Play Store nötig |
| iOS für die Gruppe | `npx eas-cli@latest build --profile production --platform ios`, dann `npx eas-cli@latest submit --platform ios` | TestFlight (Einladung per Link, bis 10.000 Personen) |

Für iOS ist das Apple Developer Program (99 $/Jahr) nötig, auch für TestFlight.

### 5. Push

- **iOS:** EAS legt den APNs-Schlüssel beim ersten Build an (`eas credentials`).
- **Android:** Firebase-Projekt anlegen, Android-App mit der App-Kennung registrieren, `google-services.json` ins Projekt legen und `GOOGLE_SERVICES_JSON=./google-services.json` setzen. Dann den FCM-V1-Dienstkontoschlüssel bei EAS hochladen (`eas credentials` → Android → Google Service Account).

Der Versand selbst braucht keinen eigenen Server: Datenbank-Trigger rufen über `pg_net` den Expo-Push-Dienst auf (`send_push` in `schema.sql`).

## So funktioniert es

**Rollen.** Wer einen Hop anlegt, ist Organisator. Alle anderen treten mit dem sechsstelligen Code bei. Organisatoren verwalten Stationen, starten und beenden den Hop, senden Durchsagen und können Mitglieder befördern oder entfernen.

**Ortung.** Geortet wird nur, solange ein Hop den Status „Läuft“ hat und die Person das Teilen nicht pausiert hat. Die App meldet die Position im Hintergrund etwa alle 15 Sekunden bzw. 15 Meter an die Funktion `report_location`. Gespeichert wird je Person nur die letzte Position, kein Bewegungsverlauf. Beim Beenden des Hops werden alle Positionen gelöscht und die Ortung schaltet sich auf den Geräten selbst ab.

**Automatische Check-ins** entscheidet der Server in `report_location`: Wer mit brauchbarer GPS-Genauigkeit im Radius einer Station steht, wird eingecheckt; ausgecheckt wird erst 40 m außerhalb des Radius, damit es am Rand nicht flattert. Wer binnen 10 Minuten zurückkommt, setzt den Besuch fort. Manuelles Ein- und Auschecken geht immer.

**Kosten.** Alle Beträge sind ganze Cent. Aufteilen geht gleichmäßig, nach Anteilen oder mit festen Beträgen; übrige Cent werden reihum verteilt, die Summe stimmt immer exakt (der Server prüft das zusätzlich). „Wer zahlt wem?“ schlägt möglichst wenige Überweisungen vor.

**Melden und Blockieren.** Nachrichten (lange drücken) sowie Fotos und Videos (Fahnen-Symbol) lassen sich melden. Meldungen landen samt Push bei der Organisation des Hops, die im Dashboard den Inhalt löschen, die Person entfernen oder die Meldung schließen kann. Wer jemanden blockiert, sieht dessen Chat-Nachrichten, Fotos und Videos nicht mehr und bekommt keine Pushes von ihm; Durchsagen kommen weiter an. Aufheben im Profil.

**Konto löschen** (Profil): entfernt Anmeldedaten, Profil, Nachrichten, Medien, Check-ins und Standort. Hops ohne weitere Mitglieder verschwinden; war man einzige Organisation, übernimmt das dienstälteste Mitglied. Ausgaben mit anderen bleiben für deren Abrechnung unter „Gelöschtes Konto“ bestehen.

**Datenschutz & Nutzungsregeln** stehen in `src/lib/legal.ts`, erscheinen in der App (Anmeldung und Profil) und lassen sich mit `npm run legal:export` nach `docs/datenschutz.md` schreiben. Betreiberangaben kommen aus `EXPO_PUBLIC_LEGAL_*` in `.env`.

**Privatsphäre.** Alles ist rundenprivat und über Row Level Security abgesichert: Lesen können nur Mitglieder des jeweiligen Hops. Collage-Dateien liegen in einem privaten Bucket und werden nur über kurzlebige, signierte Adressen ausgeliefert.

## Aufbau

```
index.ts                     Einstieg; registriert zuerst die Hintergrund-Ortung
app.config.ts                Berechtigungen, Schlüssel, Plugins
supabase/schema.sql          komplette Datenbank
supabase/update-von-version-1.sql   nur für bestehende Datenbanken
supabase/tests/              Datenbanktests (eingebettetes Postgres)
docs/                        Datenschutzerklärung, Vorlagen für die Store-Formulare
.github/workflows/apk.yml    APK-Build auf GitHub
scripts/build-apk.sh         APK-Build auf dem eigenen Rechner
src/app/                     Bildschirme (Expo Router)
  index.tsx                  Deine Hops, anlegen, beitreten
  round/[id]/(tabs)/         Karte · Chat · Kosten · Collage
  round/[id]/dashboard.tsx   Organisator-Dashboard bzw. Hop-Info
  round/[id]/station.tsx     Station anlegen/bearbeiten
  round/[id]/expense.tsx     Ausgabe anlegen/bearbeiten
src/providers/               Anmeldung, Rundendaten mit Realtime
src/lib/                     Ortung, Push, Geldlogik, Medien, Export, Statistik
src/components/              Bausteine der Oberfläche
```

## Prüfen

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Geldlogik: Aufteilung, Salden, Ausgleich
npm run test:db     # Datenbank: Zugriffsregeln, Check-ins, Kosten, Push-Auslöser
```

## Stand und Grenzen

- Geprüft sind Typen, Lint, die Bündelung für iOS und Android, die native Projektgenerierung sowie Geld- und Datenbanklogik per Test. **Auf echten Geräten ist die App noch nicht gelaufen** – Karte, Hintergrund-Ortung, Push und Uploads bitte als Erstes auf einem iPhone und einem Android-Gerät durchspielen.
- Nach dem Start eines Hops muss jede Person die App **einmal öffnen** und beim Standort „Immer“ erlauben, erst dann läuft die Ortung im Hintergrund (iOS und Android lassen Apps das nicht aus dem Nichts starten). Die Start-Benachrichtigung weist darauf hin. Wer die App im App-Umschalter wegwischt, beendet auf iOS die Ortung.
- Mit nur „Beim Verwenden“ wird geortet, solange die App offen ist; die Karte zeigt dann einen Hinweis.
- Die Route verbindet die Stationen in Luftlinie. Der Knopf „Route“ öffnet die Fußgänger-Navigation in Google Maps.
- Die Ortssuche beim Anlegen einer Station nutzt den Geocoder des Geräts. Alternativ: lange auf die Karte tippen.
- Videos: bis 90 Sekunden und 50 MB (Grenze des kostenlosen Supabase-Tarifs).
- Der APK-Build über GitHub Actions ist geschrieben, aber noch nie gelaufen. Schlägt der erste Lauf fehl, steht die Ursache im Protokoll des Schritts „APK bauen“.
- Für eine Veröffentlichung im App Store/Play Store: Vorlagen für die Formulare (Hintergrund-Ortung, Datensicherheit, Prüfhinweise) und eine Checkliste stehen in `docs/veroeffentlichung.md`. Die Datenschutzerklärung ist ein Entwurf, der beschreibt, was die App technisch tut; vor der Veröffentlichung rechtlich prüfen lassen.
