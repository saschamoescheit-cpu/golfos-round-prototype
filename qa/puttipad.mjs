// QA (Sascha 11.11.2026, iPad in landscape: "the flag cannot be moved at all, the putts hang"): the putt editor's tests on
// an iPad held sideways – the green wider than high, the finger read against the square drawn.
// Usage: node qa/puttipad.mjs [url]
process.env.DEVICE ??= 'iPad (gen 7) landscape';
await import('./puttzoom.mjs');
