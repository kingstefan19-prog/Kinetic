# KINETIC — Deployment (GitHub Pages)

Die App ist eine statische PWA (`index.html` + `sw.js`). Kein Build, kein Server.
Gehostet über **GitHub Pages** direkt aus diesem Repo.

## Einmalige Einrichtung (dein einziger manueller Schritt)

GitHub Pages lässt sich nicht per Skript aktivieren — einmal in den Repo-Einstellungen setzen:

1. Repo auf GitHub öffnen → **Settings** → **Pages**
2. Unter **Build and deployment**:
   - **Source:** „Deploy from a branch"
   - **Branch:** `main` · Ordner: `/ (root)` → **Save**
3. **Repo muss öffentlich sein** (Pages-Free-Bedingung). Falls privat:
   Settings → General → ganz unten „Change visibility" → Public.
   *Unbedenklich:* Der Code enthält keine Secrets, deine Trainingsdaten liegen
   nur lokal im Browser (localStorage), nie im Repo.

Nach ~1 Minute ist die App live unter:

```
https://kingstefan19-prog.github.io/Kinetic/
```

Jeder `git push` auf `main` aktualisiert die Seite automatisch.

## Auf dem iPhone/Android installieren (PWA)

1. Die URL in **Safari** (iOS) bzw. **Chrome** (Android) öffnen
2. Teilen-Menü → **„Zum Home-Bildschirm"**
3. Ab dann läuft KINETIC als eigenständige App mit Icon, offline-fähig
   (Service Worker cached die App beim ersten Laden).

> **Wichtig für iOS:** Als Homescreen-App bleiben die Daten deutlich stabiler.
> Nur im Safari-Tab (nicht installiert) kann iOS Speicher nach ~7 Tagen
> Inaktivität löschen. Immer als Homescreen-App nutzen + regelmäßig
> exportieren (Profil → Daten → Exportieren).

## Update erscheint nicht?

Der Service Worker cached die App. Nach einem Push ggf. einmal:
- App schließen und neu öffnen, oder
- im Browser hart neu laden (Reload).
Der SW ist „network-first" — beim nächsten Online-Start kommt automatisch
die neue Version.

## Später: eigene Domain (empfohlen für Langzeitnutzung)

Der wichtigste Schritt für „über Jahre": eine eigene Domain vor Pages hängen.
localStorage ist an den Origin (die Domain) gebunden — mit eigener Domain
bleiben deine Daten erhalten, egal ob der Host später wechselt.

1. Domain kaufen (z. B. `kinetic.deinname.de`, ~10 €/Jahr)
2. Repo → Settings → Pages → **Custom domain** → Domain eintragen → Save
   (legt automatisch eine `CNAME`-Datei im Repo an)
3. Beim Domain-Anbieter einen **CNAME-Record** auf
   `kingstefan19-prog.github.io` setzen
4. „Enforce HTTPS" aktivieren (nach DNS-Propagation)

Danach läuft die App am Root der Domain — alle relativen Pfade passen ohne
Änderung.

## Host wechseln (falls je nötig)

Weil alles statisch und alle Pfade relativ sind, läuft dieselbe Datei ohne
Änderung auch auf **Cloudflare Pages**, **Netlify** oder **Vercel**. Mit eigener
Domain davor bleibt der Origin — und damit deine Daten — beim Wechsel gleich.
