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
- **Order of a setup – everywhere the same** (Sascha 03.11.2026: "it cannot be that the game form comes first in one place
  and the course first in another"): **Was → Wo → Wann → Wer → Worum → Einstellungen**, then the one main button.
  - *Was*: the name (tournament, pool) and the game form / format / scoring (Spielform, Format, Wertung, Modus)
  - *Wo*: Platz, then Löcher / Kombination, Abschlag, Course Rating
  - *Wann*: Tag / Von–Bis, Startzeit
  - *Wer*: Spieler (PlayerRow, FriendChips) or Flights, then "Mitspieler einladen", then Wer erfasst / Zähler
  - *Worum*: Worum wird gespielt, Einsatz (Games, Wetten)
  - *Einstellungen*: everything else (Vorgabe, Pressen, Hausregeln, Klassen …), the optional ones last
  Neue Runde, Neues Spiel, Neue Wette, Neues Turnier, Turnierserie and their edit sheets keep this order; a block a
  screen does not have is left out, never moved.
- **One main action** per screen: `btn-primary`, full width, at the bottom (Runde starten, Spiel starten, Speichern &
  starten) – a start, never floating.
- **Saving** (Sascha 11.11.2026: "Wenn was erstmalig neu angelegt wird, brauchen wir unten rechts einen schwebenden
  Speicherbutton. Aber wenn nachträglich was bearbeitet wird, haben wir die automatische Speicherung und brauchen keine
  Speicherbuttons mehr."):
  - *Something new* (Pool anlegen, Turnier anlegen, Wette anlegen, Flight anlegen, Plan speichern): the round green tick
    bottom right – `<FloatActions save={{ label, onClick, disabled }} />`; opened from a sheet with `overSheet`.
  - *Something there already, changed*: no save button – saved by itself a moment (~900 ms) after the last change and
    when the sheet or page closes, with a quiet line `.autosave-note` ("Änderungen werden von selbst gespeichert" /
    "Speichert …" / "Gespeichert"). Pattern: `PoolEditSheet` / `WagerSheet` (screens/Wagers.tsx). A page edited in place
    whose changes are kept at once (the bag) ends its editing with the floating tick "Fertig".
- **The other actions of a screen – one action bar** (Sascha 03.11.2026: "three buttons side by side with icons in one
  menu, three text-only buttons one under the other elsewhere – that cannot be"): `.sc-actions` with `.sc-action`
  buttons (the scorecard of Rounds is the reference) – side by side, the same width, the icon over a short word, at most
  four in a row. Destructive (Löschen, Beenden) `.sc-action danger`, red, always the last on the right. Never a column
  of full-width text buttons for such actions.
- **Teilen is always the action "Teilen"** with the share icon in that bar (or the one `btn-secondary` with the icon
  when a screen has no bar) – never a bare icon in one place and a text button in another. The TopBar's one tool on
  the right is only the green pen to edit.
- **Same content, same place**: a detail screen is always – TopBar → the line under it (Platz · Tag · Löcher) → the
  status card (läuft / bestätigt / signiert) → the result / content → the action bar → the main button. A result
  always: Sieger → Ergebnis → Verlauf → Abrechnung → Scores (Scorekarte with legend) → actions.
- **A sheet** (edit a pool, a bet, a flight, an entry): its rows in the setup's order, then the action bar (Löschen /
  Entfernen red), then the quiet autosave line (changed) or the floating tick (new) – no "Speichern" button. All bars with `ActionBar` (components/ActionBar.tsx) – one icon per
  meaning (share, edit, save, finish, reopen, dissolve, delete).
- A pool's planned rounds lie in its days: there *Zeitraum* comes before *Runden (Platz)* – the one exception to Wo → Wann.
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
| A row whose choice needs its own picker (typed amount, a chain of steps) | `SheetRow` – the picker in the sheet, ✕ and the round save button (`SaveButton`, components/ui.tsx – never a "Fertig" button, 04.11.2026) | Einsatz je Skin, Höchsteinsatz, Erlaubte Pressen |
| Several switches belonging together | `SheetRow` summarising them, `ToggleList` + `ToggleRow inList` inside | Hausregeln |

Chips with five or more values, or with values that need explaining, become a row with a sheet. A sheet shows each
option with one line of what it means and ✓ at the chosen one.

**Required, not filled yet – green** (Sascha 03.11.2026): a required choice not made shows its prompt in green
("Platz wählen", "Spielform wählen", "Gegner wählen") – `SettingsRow need`, `ChoiceRow prompt`, or `settings-value need`.
A required text field gets `required` and an instruction or "z. B. …" as its placeholder ("Name eingeben"); the
placeholder then shows green. **Optional stays grey** – the rounds of a bet pool, the course there: no `need`.

## Inviting – always the same block

"Mitspieler einladen" (round, game, pool, tournament) is one block, everywhere in this order (Sascha 03.11.2026):
**QR code → the code (to type) → "Link teilen" → the linked friends** (`FriendInvite`, a tap sends the invitation).
In a setup it sits right below the players (*Wer*); on a detail screen (pool, tournament, series) below the content,
right before the action bar and the main button (Sascha 03.11.2026: "below the settlement, right before Runde starten").
When everyone has joined or it is over, it shrinks to one `SheetRow`
"Mitspieler einladen ›"; opened from the Bilanz it is not shown.

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

- **Check the whole app, not the one screen**: before pushing a change, look for the same kind of element elsewhere
  (an action bar, an invite block, a setup's order, a result) and make them the same – the older one follows this page.

- **Native app** (iOS, Capacitor): every change works in WKWebView too (no hover-only, no `window.open` without fallback,
  touch targets ≥ 44 px, `touch-action` for swipes). See the memory "GolfOS: always think of the native app".
- **Help**: the FAQ in `src/lib/help.ts` and, where a help video shows the screen, a note to re-record it.
- **QA**: the gate (`qa/gate.mjs`) green; a new screen gets its QA script with a screenshot step.
