# 11.11. Kölle – App

## Was diese App kann
- Login über Supabase
- Teilnehmer hinzufügen, bearbeiten, löschen
- Teilnehmer nach Haltestellen gruppiert und alphabetisch sortiert
- Warteliste mit Haltestelle und kurzer Notiz
- 40-Plätze-Zähler
- PDF/Drucken über Browser-Druckdialog
- Hintergrundbild Kölner Dom

## Einfache Einrichtung

### 1. Supabase erstellen
1. Gehe zu https://supabase.com
2. Kostenlos registrieren/einloggen
3. New project erstellen
4. Region z. B. Frankfurt wählen
5. Projekt-Passwort notieren

### 2. Datenbank anlegen
1. In Supabase links auf SQL Editor
2. New query
3. Inhalt aus `supabase/schema.sql` komplett einfügen
4. Run klicken

### 3. Logins für Nadine und Jana anlegen
1. In Supabase links auf Authentication
2. Users
3. Add user
4. E-Mail und Passwort für Nadine anlegen
5. E-Mail und Passwort für Jana anlegen
6. Wichtig: Auto Confirm User aktivieren, falls angezeigt

### 4. Supabase Schlüssel kopieren
1. Project Settings
2. API
3. Project URL kopieren
4. anon public key kopieren

### 5. Lokal starten auf Windows
1. Node.js installieren: https://nodejs.org
2. Projektordner öffnen
3. Datei `.env.example` kopieren und die Kopie `.env` nennen
4. In `.env` die beiden Werte eintragen:

VITE_SUPABASE_URL=deine_url
VITE_SUPABASE_ANON_KEY=dein_anon_key

5. Im Projektordner oben in die Adresszeile `cmd` schreiben und Enter drücken
6. Dann eingeben:

npm install
npm run dev

7. Die angezeigte lokale Adresse im Browser öffnen.

### 6. Online stellen
Am einfachsten mit Vercel. Wenn lokal alles läuft, kann das Projekt später über Vercel veröffentlicht werden.
