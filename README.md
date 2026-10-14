# GolfOS – Prototyp Rundenanalyse

Klickbarer Web-Prototyp der Runden-App für GolfOS. Er umfasst:
- Scorekarte;
- GPS-Lochkarte mit KI-Caddie und Grün-Neigungen;
- Schlagerkennung aus der GPS-Spur und Nachbereitung mit Strokes Gained.

Er dient als Ideengebung für die Produktentwicklung; die technische Umsetzung im Produkt ist frei.

- Fachliche Beschreibung: Features unter `GolfOS/features` (001 Schnellerfassung, 002 GPS-Lochkarte, 007 Schlagerkennung, 008/015/017 Caddie …)
- Platzdaten: © OpenStreetMap contributors (ODbL), OpenGolfAPI (ODbL); Luftbild und Höhen Baden-Württemberg © LGL (dl-de/by-2-0); Mallorca IDEIB / IGN

## Lokal starten

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Unit-Tests (Wertung, Erkennung, Caddie, Geometrie …)
npm run build
```

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Pages.

## Werkzeuge

| Was | Aufruf |
|---|---|
| Caddie-Prüfung aller Löcher (0 Fehler erwartet) | `npx tsx scripts/audit.ts` |
| Simulator der Schlagerkennung (offen / Tasche / Cart) | `npx tsx scripts/shotsim.ts 20` · mit Score und Putts: `COUNT=1 …` |
| Echte Runde aus einer Sicherung auswerten | `npx tsx scripts/backupreport.ts <golfos-backup.json>` |
| Caddie-Karten an typischen Punkten eines Platzes | `npx tsx scripts/caddiecards.ts <courseId>` |
| Caddie-Plan eines Platzes als Markdown | `npx tsx scripts/caddieplan-doc.ts <courseId> <Spielvorgabe> <out.md>` |
| Browser-Prüfungen (Playwright) | siehe `qa/README.md` |
