# QA – browser checks of the round prototype

Playwright scripts, separate from the app (own `package.json`, not installed by the app build).

```
cd qa
npm install
npx playwright install webkit      # once; Edge is used from the system
npm run rehearsal                  # dev server on http://localhost:5173/ (npm run dev in the app)
node het9.mjs http://localhost:5173/ webkit
npm run live                       # the live site
```

- `het9.mjs` – dress rehearsal Hetzenhof A, 9 holes on foot: phone out at every ball, score via the sheet, round check finds the shots.
- `live-smoke.mjs` – smoke test of a build: version, set-up hints, height grid and imagery load, score sheet on "→".
- `score.mjs` – score paths: sheet on "→", reminder when the GPS moves on without a score, scorecard correction (prints ✓/✗ per check).
