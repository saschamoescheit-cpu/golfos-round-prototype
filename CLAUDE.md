# GolfOS – for every session working in this repo

- **Design**: every new screen or change follows `docs/DESIGN.md` (Sascha 02.11.2026: Rounds and Games are the base;
  settings as rows with a sheet like "Format", not tabs; one look across Rounds, Games, Bets, Tournaments, Training,
  Agility). Compare a screenshot with the same kind of screen in Rounds/Games before pushing. Shared building blocks:
  `src/components/Settings.tsx` (SettingsRow, ChoiceRow, PickSheet, DateRow, ToggleRow), `PlayerRow` and `FriendChips`
  (screens/RoundSetup.tsx, screens/Home.tsx), `SwipeRow`.
- **Native app**: every change also for the iOS app (WKWebView, Capacitor – `src/lib/native.ts`).
- **Help**: FAQ (`src/lib/help.ts`) and help videos follow a change of what they show.
- **Gate**: `node qa/gate.mjs` green before a push to main; several sessions push to main – fetch and merge first.
