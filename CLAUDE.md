# KINETIC Athlete OS: Arbeitsregeln für Claude Code

## Projekt
- Single-File-PWA: `index.html` (HTML, CSS, JS inline) und `sw.js`. Kein Build, keine Dependencies.
- Deploy: Jeder Push auf `main` geht live (GitHub Pages laut DEPLOY.md). Deshalb nie direkt auf `main` arbeiten.
- Das Repo ist ÖFFENTLICH. Niemals Backups oder persönliche Daten committen (`kinetic-backup-*.json`, Körperdaten, Logs). Tests laufen nur mit synthetischen Fixtures.

## Nutzer und Trainingskontext
- Stefan, fortgeschritten, Ziel Recomp (KFA runter, Kraft halten oder steigern).
- Fußball: Di und Fr Training, So Spiel. Gym: in der Regel 3x pro Woche (Mo, Mi, Sa), selten 4x (optional Do).
- Fachbegriffe konsequent nutzen: E1RM, RPE, RIR, Double Progression, Deload, MEV/MAV/MRV.

## Code-Regeln
- Bestehenden Stil beibehalten: `var` und `function` in der Logik, Kommentare auf Deutsch, keine Frameworks.
- Keine `alert()`, `confirm()`, `prompt()`. Dialoge, Karten und Toasts der App nutzen.
- Datenkompatibilität: Struktur von `AppState` (history, plan, prs, user, weightLog, sleepLog, wearableLog, meals) bleibt abwärtskompatibel. Neue Felder sind optional. Alte Backups (version 2) müssen importierbar bleiben.
- Übungsnamen sind die Schlüssel der Historie und der PRs. Bestehende Namen nie umbenennen.
- Plan-Strings für Sätze/Wdh im Format `3×8-10` (parseRepRange akzeptiert Bindestrich).

## Wichtige Funktionen (Einstiegspunkte)
coachSuggestion, layoffStatus, liftTrend, stalledLifts, needsDeload, recentRpeTrend, e1rm (Epley mit RPE-Korrektur, Cap 12 Wdh), recomputePRs, loadIncrement, plateStep, justIncreasedWeight, equipmentType, MUSCLE_MAP, musclesFor, VOLUME_LM, weeklyMuscleSets, volumeProgressionAdvice, startWorkout, renderWorkout, finishWorkout, renderLog, defaultPlan, generatePlan, applyBackupState, logWeight, logWearable.

## Test-Workflow (vor jedem Commit)
1. JS aus `index.html` extrahieren und `node --check` ausführen.
2. `node tests/run.mjs` (synthetische Fixtures, siehe docs/UPGRADE-SPEC.md Phase 0).
3. Optional mit echtem Backup, das AUSSERHALB des Repos liegt: `node tests/run.mjs --backup <pfad>`.

## Arbeitsweise
- Spezifikation: `docs/UPGRADE-SPEC.md`. Immer nur die Phase umsetzen, die Stefan nennt.
- Kurze Diagnose, dann umsetzen. Ein Commit pro Unterpunkt der Spec, Commit-Text nennt die Nummer (z. B. "2.1 Klimmzug-Zusatzlast").
- Am Ende jeder Phase: Liste der Änderungen, Testergebnis, und was Stefan am Handy prüfen soll.
- Merge auf `main` nur nach ausdrücklicher Freigabe.
