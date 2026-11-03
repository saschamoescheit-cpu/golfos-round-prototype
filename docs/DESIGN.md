# GolfOS – one design for every screen

Sascha, 02.11.2026: *"Rounds and Games are the base. Not everything makes sense as a tab selection – often it is
clearer like Format in the round settings. I don't want to say this again for every new function – it must be thought
of automatically."*

Every new screen and every change follows this page. Before pushing: put a screenshot of the new screen next to the
same kind of screen in Rounds or Games – if they look or behave differently, change the new one, not the reference.

## Page

- **Title**: a module's tab starts with `h1.tab-title` (Golf spielen, Spiel starten, Wetten, Freunde); a screen opened
  from it has `TopBar` (‹ back, title, at most one tool on the right – e.g. the pen to edit).
- **Sections**: `span.eyebrow` above each block (LÖCHER, SPIELER, FORMAT …), never a heading inside a card for the
  same purpose. "(optional)" in the eyebrow when the block may stay empty.
- **Order of a setup** (as "Neue Runde"): course → holes/day → course rating → players → invite → score entry → format
  and other settings → the one main button at the bottom.
- **One main action** per screen: `btn-primary`, full width, at the bottom (Runde starten, Pool anlegen, Turnier
  anlegen). Other actions `btn-secondary`; destructive ones (Pool beenden, Löschen) red outline, last.
- The start page: GOLFOS top left with the claim small below; no big logo in the middle.

## Choices – rows, not tabs

| What | Use | Example |
|---|---|---|
| One of several, needs an explanation | `ChoiceRow` / `SettingsRow` + `PickSheet` (components/Settings.tsx) | Modus, Scoring, HCP-Vorgabe, Wer erfasst, Wertung, Netto-Klassen, Einsatz, Währung |
| A day | `DateRow` – shows "Mo., 2. Nov. 2026", the phone's picker opens; never a bare `2026-11-02` field | Tag, Von/Bis |
| Yes / no with a sentence what it means | `ToggleRow` (switch) | In der Nähe anzeigen, Mit Zähler, Übertrag |
| Course | `SettingsRow` "Platz ›" opening the course search of "Neue Runde" | every setup |
| 2–4 short values without explanation, chosen often while playing | `chip-set` chips are fine | Tee filter, quick stakes |
| Several at once from a short known set | multi-select chips (as the iOS alarm's days) | Wochentage Mo–So, "Was dir wichtig ist" |
| A rating with one tap | the scale itself | Gefühl 1–5 |
| A filter over a list (shows more or fewer rows, nothing is set) | filter chips above the list | Niveau, Ort, Sortieren, Zeitraum der Statistik |
| Who you are / pick a name from the players | name chips | "wer bist du?" beim Beitreten |
| A row whose choice needs its own picker (typed amount, a chain of steps) | `SheetRow` – the picker in the sheet, "Fertig" | Einsatz je Skin, Höchsteinsatz, Erlaubte Pressen |
| Several switches belonging together | `SheetRow` summarising them, `ToggleList` + `ToggleRow inList` inside | Hausregeln |

Chips with five or more values, or with values that need explaining, become a row with a sheet. A sheet shows each
option with one line of what it means and ✓ at the chosen one.

**Required, not filled yet – green** (Sascha 03.11.2026): a required choice not made shows its prompt in green
("Platz wählen", "Spielform wählen", "Gegner wählen") – `SettingsRow need`, `ChoiceRow prompt`, or `settings-value need`.
A required text field gets `required` and an instruction or "z. B. …" as its placeholder ("Name eingeben"); the
placeholder then shows green. **Optional stays grey** – the rounds of a bet pool, the course there: no `need`.

## Players

- Players always as `PlayerRow` (name · Tee · HCP · Vorgabe), the friends as `FriendChips` above "+ Spieler
  hinzufügen". A fixed name (from a pool or a tournament) uses `nameFixed`, not another layout.
- Friends linked by account show their photo (`Avatar photo`), a chain marks linked, a pen typed by hand.

## Lists

- Rows are `list-item` cards; deleting by swiping left (`SwipeRow`, red bin, undo in the toast), the bin tile
  "gelöscht" restores. Status as a small chip on the right of the row.
- Counters at the top as tiles (laufend · geschafft · beendet · gelöscht) as in Rounds/Wetten.

## Texts

- German first (`tr(en, de)` both always), short, the user's words: "Runde starten", not "Session beginnen".
- A hint is `muted small` under the block it explains; a problem is `notice` (green) – never a red error for something
  the user did not do wrong.
- Numbers as people say them: "HCP 12,4", "1 €", days "Mo., 2. Nov.".

## Always together with a change

- **Native app** (iOS, Capacitor): every change works in WKWebView too (no hover-only, no `window.open` without fallback,
  touch targets ≥ 44 px, `touch-action` for swipes). See the memory "GolfOS: always think of the native app".
- **Help**: the FAQ in `src/lib/help.ts` and, where a help video shows the screen, a note to re-record it.
- **QA**: the gate (`qa/gate.mjs`) green; a new screen gets its QA script with a screenshot step.
