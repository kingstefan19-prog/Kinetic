# KINETIC Upgrade-Spezifikation "Coach v2"

Stand: 21.10.2026. Grundlage: Auswertung des Backups vom 21.10.2026 (51 Sessions, 13.05. bis 19.10.2026) und Code-Review von `index.html` (Commit 125deea).

Reihenfolge der Phasen = Priorität. Jede Phase ist einzeln deploybar.

---

## Phase 0: Sicherheit und Testgerüst

**0.1 Branch.** Arbeit auf Branch `upgrade/coach-v2`. Kein Push auf `main` ohne Freigabe.

**0.2 .gitignore.** Anlegen bzw. ergänzen:
```
kinetic-backup-*.json
*.backup.json
/local/
```

**0.3 Test-Harness** `tests/harness.mjs`:
- Liest `index.html`, extrahiert alle Inline-`<script>`-Blöcke und führt sie in `node:vm` aus.
- Minimale Mocks: `document` (getElementById liefert Dummy-Elemente), `window`, `localStorage` (In-Memory), `navigator`, `setTimeout`/`setInterval` als No-op.
- Exportiert eine Funktion `loadApp(state)`, die `AppState` mit einem übergebenen State befüllt und den VM-Kontext zurückgibt (damit `ctx.coachSuggestion(...)` usw. aufrufbar sind).
- Falls der Init-Code beim Laden zu viel DOM braucht: Init-Aufrufe im Harness abfangen, nicht `index.html` umbauen.

**0.4 Fixtures** `tests/fixtures/*.json`: synthetisch erzeugt, KEINE echten Daten. Mindestens:
- `bodyweight-plateau.json`: Klimmzüge 4×10 in 3 Sessions hintereinander (w = 105).
- `bench-oscillation.json`: Bankdrücken (LH) 110 kg mit 8,8,6,5 Wdh, RPE 8.
- `outliers.json`: Skull Crushers (LH) mit Sätzen 18×8, 25×10, 125×12; ein Satz mit RPE 78; eine Session mit durationMs = 48 h.
- `skipped-legs.json`: 3 Wochen nur Push/Pull/Upper, kein Legs-Tag.
- `post-layoff.json`: Schrägbankdrücken (KH) 42 kg × 9 vor 25 Tagen Pause, danach 34 kg × 10 bei RPE 6.7.

**0.5 Runner** `tests/run.mjs`: führt alle Tests aus, gibt PASS/FAIL je Test aus, Exit-Code 1 bei Fehlern. Option `--backup <pfad>` lädt zusätzlich ein echtes Backup und gibt nur eine Zusammenfassung aus (Anzahl Sessions, gefundene Ausreißer, Volumen pro Muskel), ohne Daten zu speichern.

Akzeptanz: `node tests/run.mjs` läuft ohne Fehler durch (Tests der späteren Phasen dürfen zunächst als "TODO" markiert sein).

---

## Phase 1: Datenqualität

**1.1 Plausibilitätsprüfung bei der Eingabe** (beim Abhaken eines Satzes in `renderWorkout`):
- Gewicht > 1,5× oder < 0,5× des letzten Arbeitsgewichts dieser Übung: Inline-Rückfrage "125 kg statt 25 kg? Bestätigen / Korrigieren". Kein `confirm()`.
- RPE nur 5 bis 10 in 0,5-Schritten (Input `min`, `max`, `step` und Clamp beim Speichern). Werte außerhalb werden nicht gespeichert.
- Wdh 1 bis 50.

**1.2 Session-Dauer.**
- Beim Abhaken eines Satzes `activeSession.lastSetTs = Date.now()` setzen.
- In `finishWorkout`: `durationMs = (lastSetTs || Date.now()) - startTs`.
- Beim App-Start: Ist eine `activeSession` älter als 3 h, Karte anzeigen "Offene Session von <Datum> beenden?" mit "Beenden" (nutzt lastSetTs) und "Verwerfen".
- Statistiken (Log, Dashboard) ignorieren Sessions mit durationMs > 4 h bei Zeit-Kennzahlen.

**1.3 Log bearbeiten.** In `renderLog` pro Session: Satz bearbeiten (w, r, rpe) und Satz oder Session löschen. Danach `AppState.prs = recomputePRs(AppState.history)` und speichern. Log zeigt aktuell nur 20 Sessions: "Mehr laden" ergänzen.

**1.4 Bereinigungs-Assistent** (einmalig über Profil > Daten > "Daten prüfen" aufrufbar):
- Findet Sätze mit w > 2× Median der Übung, RPE außerhalb 5 bis 10, Sessions > 4 h.
- Liste mit Aktionen "Korrigieren", "Löschen", "Ist korrekt".
- Bekannte Fälle im echten Backup (zur Kontrolle): Skull Crushers (LH) 125 kg am 29.05., Kabel-Pullover (stehend) 90 kg am 28.05., Pec Deck 95 kg (1. Satz) am 11.07., RPE 78 am 23.09., Dauer 2904 / 463 / 209 / 148 Min.

Akzeptanz: Fixture `outliers.json` liefert genau 3 Funde. Nach Löschen des 125-kg-Satzes liegt der PR für Skull Crushers (LH) unter 60.

---

## Phase 2: Coach-Logik (`coachSuggestion` und Helfer)

**2.1 Klimmzüge und andere Körpergewichtsübungen.**
Ist-Zustand: Zusatzgewicht wird erst bei Obergrenze + 3 Wdh empfohlen (bei 6-10 also erst ab 13). Folge im Log: monatelang 4×10 ohne Laststeigerung.
- Neu: Schaffen ALLE Arbeitssätze die Obergrenze (z. B. 4×10), dann Empfehlung "+2,5 kg Zusatzlast, wieder bei Untergrenze starten".
- Körpergewicht aus `AppState.user.weight` (bzw. letztem weightLog-Eintrag), nicht aus dem zuletzt geloggten w.
- UI: Bei Körpergewichtsübungen Feld "Zusatz (kg)" statt "kg". Gespeichert wird `w = Körpergewicht + Zusatz` (bleibt kompatibel zu E1RM und Historie) plus neues optionales Feld `add`.
- Plank und Nordic bleiben ausgenommen (wie bisher).

Akzeptanz: Fixture `bodyweight-plateau.json` ergibt Hinweis mit "+2,5 kg" und reps = 6.

**2.2 Grundübungen: kleinere Sprünge und strengere Regel.**
Ist-Zustand: `loadIncrement` gibt bei Langhantel > 100 kg +5 kg. Mit der Mehrheitsregel (`hitTop` ab der Hälfte der Sätze) führte das beim Bankdrücken zu 110 auf 115, Abbruch, zurück auf 110 (z. B. 15.06. und 23.06.).
- `loadIncrement` für barbell: 2,5 kg bis 140 kg, darüber 5 kg. Für Oberkörper-Grundübungen (Bank, Schrägbank LH, Military, Rudern LH) immer 2,5 kg.
- Für `isCompoundLift(exName)`: `hitTop` erst, wenn ALLE Arbeitssätze die Obergrenze erreichen. Mehrheitsregel bleibt für Isolationsübungen.
- Bug: `loadIncrement` gibt bei Kurzhanteln ab 24 kg +2,5 kg, `plateStep` kennt aber nur 2-kg-Schritte. Ergebnis wären 36,5-kg-Hanteln, die es nicht gibt. Steigerung muss immer ein Vielfaches von `plateStep` sein (Kurzhantel: 2 kg).

Akzeptanz: Fixture `bench-oscillation.json` (8,8,6,5) ergibt KEINE Steigerung. Bei 8,8,8,8 ergibt sie 112,5 kg.

**2.3 Obergrenze überschritten.** Wenn bei Nicht-Körpergewichtsübungen ein Arbeitssatz Obergrenze + 2 Wdh oder mehr erreicht: Hinweis "Gewicht zu leicht, nächstes Mal steigern" und Steigerung vorschlagen, auch wenn die Mehrheit die Obergrenze nicht erreicht hat.

**2.4 Geräteschritte pro Übung.** Neues optionales Feld `AppState.equipSteps[exName]` (kg). Im Workout pro Übung editierbar ("Gewichtsschritt an deinem Gerät"). `loadIncrement` und `plateStep` nutzen den Wert, wenn gesetzt.
Hintergrund: Kabel-Seitheben ging von 15 kg direkt auf 20 kg (Gerät) und lief vorher bis 20 Wdh.
Ist der Schritt größer als 15 % der Last: Empfehlung "erst bis Obergrenze + 3 Wdh, dann steigern".

**2.5 Niedrige RPE wird zur Steigerung.**
Ist-Zustand: Bei RPE ≤ 7 nur der Text "ggf. +x kg".
- Neu: Ist die Durchschnitts-RPE in 2 Sessions hintereinander ≤ 7 und liegen die Wdh im Zielbereich, wird `weight` tatsächlich um `loadIncrement` erhöht.

**2.6 Vor-Pausen-Referenz nach einer Pause.** `layoffStatus` bleibt. Zusätzlich:
- Speichere das Arbeitsgewicht vor der Pause (Maximum der letzten 2 Sessions vor der Lücke).
- In den 4 Sessions nach der Pause: Hinweis "Vor der Pause: 42 kg × 9". Liegt das aktuelle Gewicht darunter und sind die Wdh im Bereich bei RPE ≤ 8, wird pro Session um einen Schritt gesteigert, bis das alte Niveau erreicht ist.

Akzeptanz: Fixture `post-layoff.json` ergibt 36 kg (statt 34 kg mit +1 Wdh).

---

## Phase 3: Volumen und Adherence

**3.1 Bug in `volumeProgressionAdvice`.** Die Zeile `if(sets<=0) return;` unterdrückt die Warnung genau dann, wenn ein Muskel gar nicht trainiert wurde. Neu: Muskeln aus dem aktiven Plan mit 0 Sätzen ergeben "nicht trainiert (0/MEV)".

**3.2 Glättung.** Volumen-Ampel auf Durchschnitt der letzten 14 Tage pro Woche umstellen statt rollierend 7 Tage. Ein ausgefallenes Training kippt sonst sofort alle Ampeln.

**3.3 Adherence-Erkennung.** Für jeden Gym-Tag im Plan zählen, wie oft er in den letzten 21 Tagen absolviert wurde. Beim Matchen Namenszusätze wie " (KI-optimiert)" und " (optimiert)" entfernen. Fehlt ein Tag in 2 der letzten 3 Wochen, erscheint eine Karte "<Tag> fällt oft aus" mit den Aktionen "Wochentag verschieben" und "3+1-Plan übernehmen" (Phase 5). Tage mit `optional:true` werden nicht gezählt.

**3.4 Konstanten aktualisieren.**
- `VOLUME_LM.hams.mev` von 6 auf 4 (RP: MEV 2 bis 4 Sätze).
- Veraltete Kommentare in `VOLUME_LM` und `defaultPlan` ("Plan: 12/Wo") korrigieren oder entfernen.
- `MUSCLE_MAP`: Regex für Adduktoren um `copenhagen|adduct` erweitern (bisher matcht nur `adduk`).

**3.5 Plan-Untertitel dynamisch.** Satzanzahl und geschätzte Dauer im `sub` jedes Tages aus den Übungen berechnen statt statischem Text ("20 Sätze" stimmt bei Push A nicht, es sind 22).

Akzeptanz: Fixture `skipped-legs.json` ergibt Warnungen für quads, hams und wade sowie eine Adherence-Karte für Legs A.

---

## Phase 4: RPE-Qualität

Befund: 89 % aller Sätze haben RPE 7 oder 8, 60 % genau 8, obwohl die Wdh bei gleicher RPE steigen. Die RPE ist nicht vorbelegt, das ist Gewohnheit beim Eintragen.

**4.1 Schnellwahl.** RPE-Feld als Buttons 6 / 7 / 8 / 9 / 10 (lange drücken für ,5). Unter den Buttons die RIR-Übersetzung ("8 = noch 2 Wdh möglich").

**4.2 Varianz-Check.** Haben mehr als 70 % der letzten 40 Sätze denselben RPE-Wert, erscheint eine Karte: "Deine RPE wirkt gewohnheitsmäßig. Heute im letzten Satz von <letzte Isolationsübung> so viele Wdh wie möglich (AMRAP)."

**4.3 Kalibrierung.** Beim AMRAP-Satz: Aus der vorherigen RPE wird die erwartete Wdh-Zahl berechnet, mit der tatsächlichen verglichen und ein Offset gespeichert (`AppState.rpeOffset`, z. B. +1,5 = unterschätzt die Reserve). Der Offset wird angezeigt, aber nicht automatisch in `e1rm` eingerechnet.

---

## Phase 5: Plan "3+1 Fußball"

Neue Funktion `plan3plus1()` im Format von `defaultPlan()`. Auswahl unter Plan > "Vorlage übernehmen" mit Bestätigungsdialog. Historie und PRs bleiben unverändert. Bestehende Übungsnamen exakt so übernehmen wie unten geschrieben.

| Tag | Typ | Inhalt |
|---|---|---|
| Mo | gym | Upper A |
| Di | soccer | Fußball Training |
| Mi | gym | Lower (48 h vor Freitag) |
| Do | gym, `optional:true` | Arme + Schulter + Core (nur wenn Zeit, keine Beine) |
| Fr | soccer | Fußball Training |
| Sa | gym | Upper B (keine Beine, Spiel am So) |
| So | match | Fußball Spiel |

**Upper A** (ca. 65 Min)
- Bankdrücken (LH) 4×5-8, RIR 2
- Klimmzüge 4×6-10, RIR 2, ab 4×10 Zusatzlast
- Schrägbankdrücken (KH) 3×8-12, RIR 2
- Rudern (LH Untergriff) 3×8-10, RIR 2
- Seitheben (Kabel) 3×12-15, RIR 1
- Trizeps Pushdown (Seil) 3×10-12, RIR 2
- Bizeps Curl (LH) 3×8-10, RIR 2

**Lower** (ca. 60 Min, RIR 2-3, kein Versagen)
- Kniebeuge (LH) 3×5-8, RIR 2
- Rumänisches Kreuzheben (LH) 3×8-10, RIR 2-3
- Beinpresse 2×10-12, RIR 3
- Beinstrecker 2×12-15, RIR 2
- Nordic Curl (Beinbizeps) 2×4-6, langsam absenken, Start mit Teil-ROM
- Beinbeuger (Maschine liegend) 2×10-12, RIR 2
- Copenhagen Adduction 2×20-30s pro Seite, `timed:true`
- Abduktionsmaschine (sitzend) 2×12-15
- Wadenheben stehend 3×10-15

**Upper B** (ca. 65 Min)
- Schrägbank Bankdrücken (LH) 3×6-8, RIR 2
- Latzug (Untergriff eng) 3×10-12, RIR 2
- Schulterdrücken (KH sitzend) 3×8-10, RIR 2
- Einarmiges KH-Rudern 3×8-10, RIR 2
- Pec Deck / Maschinen-Flys 2×12-15, RIR 1
- Seitheben (Kabel) 3×12-15, RIR 1
- Overhead Extension (KH) 3×10-12, RIR 2
- Face Pulls (Kabel) 2×12-15
- Hammer Curl (KH) 2×12-15, RIR 2

**Optional Do** (30-40 Min)
- Seitheben (KH) 3×12-15
- Incline Curl (KH) 45° 3×12-15
- Skull Crushers (LH) 3×8-10
- Face Pulls (Kabel) 2×15-20
- Plank 3×45s, `timed:true`

Zielvolumen pro Woche (3 Pflichttage, direkte Sätze): Brust 12, Rücken 13, Schulter seitlich 6, Trizeps 6, Bizeps 5 (plus Anteil aus Zugübungen), Quads 7, Hamstrings 7, Waden 3. Fußball kommt bei Beinen und Waden dazu.

Ergänzend `EXERCISE_FAMILIES`: "Copenhagen Adduction" in eine Adduktoren-Familie aufnehmen (`timed:true`).

Akzeptanz: Nach Übernahme hat der Plan 7 Tage, 3 Pflicht-Gymtage, 1 optionalen Tag. `weeklyMuscleSets` auf einer simulierten Woche ergibt für hams mindestens 6.

---

## Phase 6: Daten erfassen

**6.1 Gewicht.** Dashboard-Karte am Montag, wenn der letzte weightLog-Eintrag älter als 7 Tage ist. Ohne Gewichtsverlauf ist die Recomp nicht auswertbar.

**6.2 Luna-Check-in.** Erinnerung, wenn wearableLog seit 3 Tagen leer ist (Backup: wearableLog komplett leer, sleepLog nur 1 Eintrag).

---

## Phase 7: Release

1. In der App über Profil > Daten > Exportieren ein Backup ziehen (vor dem Update).
2. `sw.js`: `CACHE` auf `kinetic-v2` setzen.
3. `node --check` und `node tests/run.mjs` grün.
4. Stefan gibt frei, dann Merge `upgrade/coach-v2` auf `main`.
5. Am Handy: App schließen und neu öffnen, Version prüfen, ein Test-Workout anlegen und verwerfen.
