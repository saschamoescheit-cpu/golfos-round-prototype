# GolfOS – Prototyp Rundenanalyse

Klickbarer Prototyp der **Schnellerfassung** (digitale Scorekarte) für die GolfOS-App. Dient als Ideengebung für die Produktentwicklung; die technische Umsetzung im Produkt ist frei.

- Fachliche Beschreibung: Feature 001 „Rundenanalyse – Schnellerfassung“
- Platzdaten: © OpenStreetMap contributors (ODbL), OpenGolfAPI (ODbL)

## Lokal starten

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Unit-Tests der Wertung (Stableford, Vorgabeschläge, GIR)
npm run build
```

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Pages.
