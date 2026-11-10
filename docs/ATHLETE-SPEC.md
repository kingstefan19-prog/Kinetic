# KINETIC · Athleten-Modus (feat/athlete-mode)

Ziel: von „Recomp/Muskelaufbau“ auf „starker Athlet“. Maximalkraft, Schnellkraft und
Fußball-Leistung, Muskelmasse halten, KFA langsam senken. Kein Bodybuilding.

Grundsätze (wie CLAUDE.md):
- Übungsnamen nie umbenennen. Der Plan behält die bestehenden Übungen, nur Sätze, Wdh,
  RIR und Pausen ändern sich.
- AppState bleibt abwärtskompatibel, alle neuen Felder sind optional, Backups version 2
  bleiben importierbar.
- Ohne `user.trainingGoal` oder mit `'recomp'` verhält sich die App exakt wie heute.
  Alles in Phase A gilt nur bei `'athlete'`. Ausnahmen, die immer gelten: A9, B1–B7, Phase C.
- Tests nur mit synthetischen Fixtures. Keine Werte aus echten Backups in Repo, Tests oder Spec.
- Die Ergänzung nach der Backup-Auswertung hat Vorrang. Sie ist unten eingearbeitet
  (A7 geändert, A9–A11 neu, B3 erweitert, B7, C2 ergänzt).

---

## 1. Datenmodell (alle Felder optional)

| Ort | Feld | Typ | Bedeutung |
|---|---|---|---|
| `user` | `trainingGoal` | `'recomp' \| 'athlete'` | A1. Fehlt = `'recomp'` |
| `user` | `powerPrimer` | `boolean` | A7. Fehlt = an |
| `plan[].ex[]` | `role` | `'main-heavy' \| 'main' \| 'assist' \| 'iso' \| 'prevent'` | A2, Override der automatischen Rolle |
| `plan[].ex[]` | `prevS` | String | A3, Plan-String vor der Umstellung (für „Rückgängig“) |
| `history[].sets[]` | `ts` | ms | A10, Zeitpunkt des Abhakens |
| `history[]` | `primer` | `{kind, sets, reps}` | A7, geloggt ohne Gewicht, zählt nicht als Satz |
| `history[]` | `entry` | `true` | A3, erste Einheit nach der Umstellung (kein Steigerungsvorschlag) |
| `activityLog[]` | `minutes` | Zahl | A5, Spielminuten |
| `schedule` | `apptMinutes` | `{"YYYY-MM-DD\|apptId": min}` | A5/A9, Minuten für automatisch gezählte Termine |
| DB | `athleteSwitch` | `{ts, from:'recomp'}` | A3, Zeitpunkt der Umstellung |

Interne Rollennamen sind Englisch (`main-heavy`), angezeigt wird Deutsch:
„Hauptübung schwer“, „Hauptübung“, „Assistenz“, „Isolation“, „Prävention“.

Entfernt bzw. nicht mehr gespeichert: `user.ffmi` (B4, wird nur noch berechnet).
Ein vorhandener Wert in alten Daten wird ignoriert, aber nicht gelöscht.

---

## 2. Phase A · Trainingslogik „Athletik-Kraft“

### A1 Ziel-Schalter
- Neu im Profil: „Trainingsziel: Recomp | Athlet“. Umschalten auf Athlet startet A3
  (Vorschau). Zurück auf Recomp bietet „Plan zurücksetzen“ an, mit den Werten aus `prevS`.
- `trainingGoal()` liefert `user.trainingGoal || 'recomp'`, `isAthlete()` ist der Schalter
  für alle Regeln unten.

### A2 Übungsrollen
`exerciseRole(exName, planEntry)`: Zuerst gilt `planEntry.role`, dann die Tabelle, dann die Regel.

| Rolle | Übungen |
|---|---|
| main-heavy | Bankdrücken (LH), Kniebeuge (LH), Schrägbank Bankdrücken (LH) |
| main | Klimmzüge, Rudern (LH Untergriff), Rumänisches Kreuzheben (LH), Schulterdrücken (KH sitzend) |
| prevent | Nordic Curl (Beinbizeps), Copenhagen Adduction, Wadenheben stehend |
| assist | übrige Übungen mit `isCompoundLift()` (z. B. Beinpresse, Latzug, Einarmiges KH-Rudern, Schrägbankdrücken (KH)) |
| iso | alles andere (Curls, Seitheben, Pushdown, Beinstrecker, Beinbeuger, Abduktion, Face Pulls, Pec Deck …) |

Zeitübungen ohne Tabelleneintrag (Plank) behalten ihre Vorgabe und keine Rolle.

### A3 Vorgaben je Rolle und Umstellung
| Rolle | Sätze×Wdh | Ziel-RIR Wo 1–3 | Ziel-RIR Wo 4–5 | Pause |
|---|---|---|---|---|
| main-heavy | 4×3-6 | 2–3 (Coach rechnet mit 2,5) | 1–2 (1,5) | 210 s |
| main | 3–4×5-8 (bisherige Satzzahl auf 3–4 begrenzt) | 2–3 | 1–2 | 180 s |
| assist | 2–3×6-10 (bisherige Satzzahl auf 2–3) | 2 | 2 | 135 s |
| iso | 2×10-15 | 1–2 (1,5) | 1–2 (1,5) | 75 s |
| prevent | Nordic 2–3×4-8 · Copenhagen 2×20-30s je Seite · Wadenheben 3×8-12 | ≥ 2, nie Versagen | ≥ 2 | Nordic 120 s, sonst 75 s |

- RIR 0 gibt es wie bisher nur im letzten Satz einer Oberkörper-Isolationsübung in der
  Peak Week. Deload bleibt unverändert (RIR 4, ein Satz weniger, −10 %).
- Die Regel „gleicher Wdh-Bereich je Übung im ganzen Plan“ bleibt, der bestehende Test
  läuft über beide Ziele.
- `targetRIR()` und `restSecondsFor()` lesen im Athleten-Modus die Rolle.
  `targetRIRLabel()` zeigt den Bereich („RIR 2–3“).

**Umstellung** (`athletePlanPreview()` → `applyAthletePlan()`):
1. Für jede Übung im Plan: Rolle bestimmen, alten Plan-String nach `prevS` sichern, den neuen
   String berechnen.
2. Vorschau im App-Dialog als Tabelle „Übung · alt → neu · Rolle“ mit Summe je Einheit
   (Sätze und Minuten). Angewendet wird erst nach „Übernehmen“, vorher läuft `snapshotState('pre-athlete')`.
3. Startgewicht je Übung mit Historie: aus dem E1RM für die Mitte des neuen Bereichs bei
   Ziel-RIR (`loadForReps(ex, (lo+hi)/2, rir)`), auf `plateStep` **abgerundet**, bei
   Kurzhanteln auf das 2-kg-Raster.
4. Die erste Einheit jeder Übung nach der Umstellung zeigt keinen Steigerungsvorschlag. Der
   Coach-Hinweis lautet „Einstiegsgewicht, lieber zu leicht.“ Danach greift die normale
   Double Progression im neuen Bereich.

Beispiel mit der Vorlage plan3plus1 (synthetisch, aus dem Repo):

| Einheit | Übung | alt | neu | Rolle |
|---|---|---|---|---|
| Upper A | Bankdrücken (LH) | 4×5-8 | 4×3-6 | main-heavy |
| Upper A | Klimmzüge | 4×6-10 | 4×5-8 | main |
| Upper A | Schrägbankdrücken (KH) | 3×8-12 | 3×6-10 | assist |
| Upper A | Rudern (LH Untergriff) | 3×8-10 | 3×5-8 | main |
| Upper A | Seitheben (Kabel), Pushdown, Bizeps Curl (LH) | 3×… | 2×10-15 | iso |
| Lower | Kniebeuge (LH) | 3×5-8 | 4×3-6 | main-heavy |
| Lower | Rumänisches Kreuzheben (LH) | 3×8-10 | 3×5-8 | main |
| Lower | Beinpresse | 2×10-12 | 2×6-10 | assist |
| Lower | Nordic Curl (Beinbizeps) | 2×4-6 | 2×4-8 | prevent |
| Lower | Wadenheben stehend | 3×10-15 | 3×8-12 | prevent |
| Upper B | Schrägbank Bankdrücken (LH) | 3×6-8 | 4×3-6 | main-heavy |
| Upper B | Schulterdrücken (KH sitzend) | 3×8-10 | 3×5-8 | main |
| Upper B | Latzug, Einarmiges KH-Rudern | 3×… | 3×6-10 | assist |

### A4 Volumen
- Grenze je Einheit: höchstens 75 Min (`planDayStats` mit den Pausen aus A3) und
  höchstens 20 Arbeitssätze.
- `trimSession(day, {maxMin, maxSets})`: einen Satz nach dem anderen streichen, zuerst bei
  iso, dann bei assist. Gestrichen wird jeweils bei der Übung mit den meisten Sätzen, bei
  Gleichstand bei der späteren im Plan. Jede Übung behält mindestens 1 Satz. main, main-heavy
  und prevent werden nie gekürzt. Beispiel Upper B: 23 → 20 Sätze, nur Isolation gekürzt.
- Dieselbe Funktion gilt bei „wenig Zeit“ (neue Auswahl beim Start: 45 / 60 / 75 Min) und
  bei Readiness < 65, dann mit maxSets − 4.
- Volumen-Warnungen: Statt „unter MEV“ warnt die App erst unter dem Erhaltungswert von
  **4 gewichteten Sätzen je Muskel und Woche**. `volumeProgressionAdvice()` gibt im
  Athleten-Modus keine „+Sätze Richtung MAV“-Hinweise mehr. Die MRV-Grenze vor dem Workout
  bleibt.

### A5 Spielminuten
- Beim Eintragen bzw. Korrigieren eines Spiels gibt es optional ein Feld „Minuten“.
- Beinbelastung: ab 60 Min Stufe 3, 20–59 Min Stufe 2, unter 20 Min Stufe 1, ohne Angabe Stufe 3.
  Rumpf entsprechend (≥ 60 Min: 2, sonst 1).
- Gilt für `activityLog`-Einträge (`minutes`) und für automatisch gezählte Termine
  (`schedule.apptMinutes`, A9). `groupRecovery()` und `flexSuggestion()` nutzen die Stufe.

### A6 Prävention schützen
- Nordic Curl (Beinbizeps) und Copenhagen Adduction: Sind Fußballtermine eingetragen, gilt
  ein Ziel von mindestens 1× pro Woche, aber nicht in den 48 h vor Training oder Spiel.
- Liegt eine Einheit mit diesen Übungen im 48-h-Fenster, werden sie für heute
  herausgenommen, mit dem Hinweis „Nordic heute nicht: Fußball in < 48 h“. `flexSuggestion()`
  bevorzugt dann einen Tag außerhalb des Fensters (+15 Punkte für eine Einheit mit
  Prävention, wenn diese Woche noch keine dabei war).
- „Mag ich nicht“ zählt bei diesen beiden nicht für „dauerhaft ersetzen“ (Karte aus Punkt 5
  von skip-redistribute erscheint nicht).
- „Schmerz/Unwohlsein“: Die Übung pausiert, bis du „wieder aufnehmen“ tippst. Hinweis:
  „Pausiert wegen Schmerz – bei wiederkehrenden Schmerzen abklären lassen.“
- Fehlt eine der beiden im Plan, erscheint die Karte „Nordic Curl einplanen?“. Sie fügt erst
  nach Bestätigung ein, in die Bein-Einheit mit der kleinsten Satzzahl.

### A7 Power-Primer (abschaltbar, Standard an)
- Nach dem Aufwärmen 5–8 Min.
  - Unterkörper-Einheit: 3×3-5 Sprünge (Box- oder Strecksprung).
  - Oberkörper-Einheit: 3×3-5 explosive Liegestütze oder Medizinballwürfe.
  - Volle Pause (60–90 s), keine Last, geloggt als `history[].primer`. Zählt nicht als
    Arbeitssatz und nicht in Volumen oder Erholung.
- Erscheint nur, wenn die Bein-Erholung ≥ 65 % ist und in den nächsten 3 h kein Fußball
  ansteht. Nicht an Readiness gekoppelt (Ergänzung).
- Ist die Bedingung nicht erfüllt, bleibt der Primer weg, mit einer Zeile Begründung
  („Beine 58 % erholt – heute ohne Sprünge“).

### A8 Kennzahlen
- Die Kraft-Karte zeigt zuerst die main- und main-heavy-Übungen, jeweils mit E1RM und
  E1RM/kg Körpergewicht (Gewicht aus dem jüngsten `weightLog`-Eintrag bzw. `user.weight`).
  Danach folgen andere nur, wenn Platz ist.
- Benchmarks relativ zum Körpergewicht, Label „Orientierung“, nur mit Quelle (siehe §7).
  **Vorschlag:**

| Übung | Orientierung (E1RM/kg) | Quelle |
|---|---|---|
| Kniebeuge (LH) | < 1,5 · 1,5–2,0 · ≥ 2,0 (Kniebeuge ab etwa 2× Körpermasse ist in Studien mit besserem Sprung, Sprint und Leistung verbunden) | Suchomel, Nimphius & Stone 2016, Sports Med 46:1419–1449 |
| alle anderen | keine Schwellen, nur E1RM/kg und eigener Trend | keine belastbare Quelle für Fußballer |

  Ob zusätzlich nicht-wissenschaftliche Tabellen (z. B. Kilgore/Rippetoe) gezeigt werden,
  siehe offene Frage 5.

### A9 Fußball zählt automatisch (gilt immer)
- Ein fester Termin gilt nach seiner Uhrzeit als stattgefunden und zählt in
  `flexEvents()` bzw. `groupRecovery()`, außer er ist als „fällt aus“ markiert. Eine
  Bestätigung ist nicht nötig.
- Doppelt zählt nichts: Steht für denselben Tag dieselbe Aktivität im `activityLog`, zählt
  nur der Log-Eintrag.
- Korrektur mit einem Tipp in der Karte „Heute“ und im Log: „fiel aus“ oder „Minuten“ (A5).
  Die Frage „stattgefunden?“ entfällt.
- Ersetzt die Regel aus feat/flex-planning, dass nur Eingetragenes zählt.
- **Test:** Ohne `activityLog`-Eintrag senkt ein vergangener Fußballtermin die
  Bein-Erholung, ein abgesagter nicht.

### A10 Pausen einhalten
- Jeder abgehakte Satz bekommt `ts` (Zeitpunkt des Abhakens).
- Wird bei main oder main-heavy der nächste Satz weniger als 120 s nach dem vorherigen
  abgehakt, erscheint ein kurzer Toast „Pause 1:30 – Ziel 3:30 für schwere Sätze“. Er
  blockiert nichts.
- Nach dem Workout (Toast) und im Log (je Session) steht die Ø Pause der Hauptübungen
  gegen das Ziel, z. B. „Ø Pause Hauptübungen 2:40 / Ziel 3:15“.

### A11 Hauptübungen nicht ans Limit
- Hatte ein Satz einer main- oder main-heavy-Übung RIR 0 (RPE ≥ 9,5), bleibt das Gewicht in
  der nächsten Einheit gleich, ohne Steigerung. Hinweis „Letztes Mal am Limit – Gewicht
  halten, RIR 2 anpeilen.“ Das hat Vorrang vor hitTop.
- „Nächste Übung“ bei einer main-Übung mit abgehakten Sätzen ohne RIR: Die RIR-Schnellwahl
  springt auf den ersten Satz ohne Wert, mit dem Hinweis „RIR für Satz x fehlt“. Ein zweiter
  Tipp geht trotzdem weiter (siehe offene Frage 4).

---

## 3. Phase B · Fehler und Altlasten (gelten für beide Ziele)

- **B1** `oftenMissedDays` → `unitAdherence()`: je Einheit die Anzahl in den letzten
  3 Wochen. Die Karte lautet „Lower in 3 Wochen nur 1× trainiert“ mit dem Knopf „Lower als
  Nächstes“, der die Einheit in der Rotation nach vorn setzt. Keine Wochentage mehr.
- **B2** Den statischen Banner `plan-update-banner` („Plan v5 geladen“) samt Code entfernen.
- **B3** `BENCH_STD` entfällt bzw. wird durch A8 ersetzt. Neu ist die Alias-Tabelle
  `EX_ALIAS` beim **Lesen** (die Historie wird nicht umgeschrieben):
  `Kniebeuge → Kniebeuge (LH)`, `Rudern (LH) → Rudern (LH Untergriff)`,
  `Schulterdrücken → Schulterdrücken (KH sitzend)`, `Latzug → Latzug (Untergriff eng)`,
  `Seitheben → Seitheben (Kabel)`. Fehlt ein Eintrag, ordnen die Übungsfamilien zu.
  `recomputePRs`, `e1rmHistory`, `liftTrend`, Kraft-Karte und Benchmarks nutzen
  `canonicalEx()`. Die alten Klimmzüge-Schwellen von 0 entfallen.
- **B4** `ffmiOf(user)` rechnet immer aus Gewicht, Größe und KFA, gespeichert wird nichts.
  Fehlt ein Wert, zeigt die App „—“. Die Stellen im Onboarding, beim Speichern des Profils
  und nach dem Import setzen kein `ffmi` mehr.
- **B5** Persönliche Standardwerte entfernen: Die Defaults in `AppState.user`, in `load()`
  und in den Platzhaltern der Profil-Vorschau werden neutral (leer bzw. `null`). Der
  Kommentar „Stefan / bestehende User“ über dem Plan-Generator wird neutral formuliert.
  Gespeicherte Nutzerdaten bleiben unberührt. Funktionen, die Gewicht brauchen, zeigen „—“
  bzw. „Gewicht eintragen“.
- **B6** Bei „Wadenheben stehend“ (defaultPlan-Notiz und FORM_TIPS) den Hinweis auf
  Teilwiederholungen nach Muskelversagen streichen. Neu: „Volle ROM, 2 s Dehnung unten,
  RIR ≥ 1“.
- **B7** Der bestehende Assistent „Daten prüfen“ erscheint als Karte auf „Heute“, solange es
  Ausreißer gibt: ein Satz über dem doppelten Median der Übung, RPE außerhalb 5–10 oder eine
  Session über 4 h. Nach dem Korrigieren wird `recomputePRs` aufgerufen.

---

## 4. Phase C · Design und UI (Identität bleibt: dunkel, roter Akzent, Inter)

- **C1 Tokens:**
  - Abstände: `--s1:4px --s2:8px --s3:12px --s4:16px --s5:24px`.
  - Schrift mindestens 12 px, nur das Nav-Label hat 11 px.
  - `--t3: #8E8E93`.
  - Gefüllte rote Knöpfe: `#D32F2F`.
  - Ein Kontrast-Test prüft die Textfarben gegen die Hintergründe auf mindestens 4,5:1.
  - Nachgerechnet: `#8E8E93` erreicht auf `--bg` (#121212) 5,75:1, auf `--card` 5,11:1,
    auf `--card2` 4,70:1, auf `--card3` (#2C2C2C) aber nur 4,28:1. Dort wird `--t3`
    nicht für Text genutzt, sondern `--t2`.
  - Weißer Text auf `#D32F2F` erreicht 4,98:1.
- **C2 Tab „Heute“** (bisher Dash):
  - Titelbereich höchstens 64 px: Name, Datum, Zykluswoche. Die Kennzahlen-Pillen wandern ins Profil.
  - Reihenfolge der Inhalte:
    1. Tagesvorschlag mit Begründung und Start-Knopf, darin Readiness als eine Zeile und
       Luna als Zeile, wenn es in den letzten 14 Tagen Daten gab (keine tägliche Karte mehr).
    2. Höchstens ein Hinweis, die übrigen hinter „weitere Hinweise“.
    3. Wochenleiste Mo–So (erledigt ✓, geplant, Termine).
    4. Kraft.
    5. Einmal pro Woche ein Ein-Feld-Eintrag „Gewicht“.
    6. Der Rest.
  - Den Tab „Essen“ ersetzt in der Hauptnavigation nichts, er wandert ins Profil
    (Profil → Ernährung).
- **C3 Workout:**
  - Die Satztabelle steht direkt unter Übungsname, Ziel und „Letztes Mal“.
  - Der Coach-Hinweis ist einzeilig (antippen klappt ihn auf).
  - Technik, Gewichtsschritt und Varianten liegen im einklappbaren Bereich „Details“.
  - Unten feste Leiste mit Pausen-Timer und „Nächste Übung“.
  - Touch-Flächen mindestens 44 px.
- **C4** Plan-Kopf: Die vier Knöpfe wandern in ein Menü „⋯“.
- **C5** Inline-SVG-Iconset (Stroke 1,75, 24 px, `currentColor`, eigene Pfade, keine Fremd-Dateien)
  für die Navigation und die Hinweis-Karten statt Emojis.
- **C6** Inline-Styles nur auf den angefassten Screens (Heute, Workout, Plan-Kopf, Nav)
  durch Klassen ersetzen.
- **C7** `user-scalable=no` entfernen, die Nav bekommt `padding-bottom: env(safe-area-inset-bottom)`,
  und `@media (prefers-reduced-motion: reduce)` schaltet Animationen und Übergänge ab.
- **C8** Screenshots vorher/nachher mit Playwright (vorinstalliertes Chromium) bei 390×844
  und 360×740, mit synthetischem Fixture. Ein Test prüft
  `scrollWidth <= innerWidth` (kein horizontales Scrollen). Die Screenshots kommen in den
  Scratchpad und in den Bericht, nicht ins Repo.

---

## 5. Umsetzung und Tests

- Branch `feat/athlete-mode`, ein Commit pro Unterpunkt (A1 … A11, B1 … B7, C1 … C8),
  Reihenfolge A → B → C, Abschlussbericht nach jeder Phase.
- Neues Fixture `tests/fixtures/athlete-switch.json` (synthetisch, Werte frei gewählt):
  plan3plus1, 8 Wochen Historie, Fußball Mi/Fr, Spiel So mit unterschiedlichen Minuten,
  ein RIR-0-Satz bei Kniebeuge, kurze Pausen bei Bankdrücken, alte Übungsnamen
  („Kniebeuge“, „Rudern (LH)“) für B3, ein Ausreißer für B7.
- Tests je Unterpunkt: z. B. A3 (Vorschau, nichts ändert sich vor Bestätigung, Startgewicht
  abgerundet), A4 (Upper B 23 → 20 Sätze, nur iso gekürzt), A9 (Pflichttest oben),
  A11 (RIR 0 → kein Steigerungsvorschlag), B3 (PR von „Kniebeuge“ landet bei
  „Kniebeuge (LH)“, Historie unverändert), C8 (kein horizontales Scrollen).
- Mit `trainingGoal` fehlend müssen alle bestehenden Tests unverändert grün bleiben.

---

## 6. Entscheidungen (Stefan, 10.11.2026) – gehen den Abschnitten oben vor

1. **A6 Prävention:** nicht in den 48 h vor einem Spiel und nicht in den 24 h vor einem Training.
2. **A3 Ziel-RIR:** Bereich „RIR 2–3“ bzw. „RIR 1–2“. Der Coach rechnet mit der Mitte (2,5 / 1,5).
3. **A3/A4 Zeit und Pausen:** Einheiten in der Regel höchstens **60 Min**, einstellbar im Profil
   (Standard 60). Kurze Pausen: main-heavy 150 s, main 120 s, assist 90 s, iso 60 s,
   Nordic 90 s, sonst 60 s. A10 meldet sich bei Haupt­übungen erst unter 90 s.
4. **A11 RIR-Pflicht:** „Nächste Übung“ ist bei main/main-heavy **gesperrt**, bis jeder
   abgehakte Satz einen RIR hat. Hat eine Übung **keinen** erledigten Satz, schlägt
   „Nächste Übung“ einen Ersatz vor: Familien-Varianten, die nicht schon in der Einheit sind,
   sortiert nach möglichst geringer Überschneidung (gleiche Familie bzw. gleiche Primärmuskeln)
   mit den anderen Übungen der Einheit. Dazu „Ohne Ersatz weiter“ (zählt als übersprungen,
   Grund „Mag ich nicht“ wird nicht automatisch gesetzt, sondern abgefragt wie gewohnt).
5. **A8 Benchmarks:** nur der eigene Trend (E1RM und E1RM/kg über 8 Wochen), keine Schwellen –
   auch nicht für die Kniebeuge. Die Quellen in §7 bleiben als Hintergrund.
6. **C2 Navigation:** Heute · Plan · Workout · Log · Profil.

## 7. Quellen
- Suchomel TJ, Nimphius S, Stone MH. The importance of muscular strength in athletic
  performance. *Sports Med.* 2016;46(10):1419–1449. PubMed 26838985. Teilt relative Kraft in
  „strength deficit“, „strength association“ und „strength reserve“. Berichtet, dass Athleten
  mit einer Kniebeuge von mindestens 2× Körpermasse höher springen, schneller sprinten und
  mehr Leistung erzeugen. Zu 2,5× gibt es kaum Daten.
- Wisløff U et al. Strong correlation of maximal squat strength with sprint performance and
  vertical jump height in elite soccer players. *Br J Sports Med.* 2004;38:285–288.
  PubMed 15155427. Halbe Kniebeuge, daher nicht als Schwelle für die volle Kniebeuge genutzt,
  nur als Beleg für den Zusammenhang Kraft → Sprint/Sprung im Fußball.
