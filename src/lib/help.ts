import { tr } from './i18n';

// Help in the profile (Sascha 23.10.2026: "an introduction video – a kind of tutorial – and an FAQ, anchored in the
// profile"): the tutorial in chapters plus the whole tour (made in GolfOS/tutorial: recorded in the app, subtitles and
// a computer voice), and the frequent questions by topic – every answer with the chapter that shows it.
// The videos are files of the app (public/help/<id>.mp4, poster <id>.jpg) – loaded only when played, not kept offline.

export interface HelpVideo {
  id: string;
  title: () => string;
  about: () => string;
  /** length as shown, e.g. "0:58" */
  length: string;
}

export const HELP_VIDEOS: HelpVideo[] = [
  { id: 'start', title: () => tr('Start a round', 'Runde starten'), about: () => tr('Course, loops, your tee, playing handicap, birdie book', 'Platz, Schleifen, dein Tee, Vorgabe, Birdiebook'), length: '0:53' },
  { id: 'flight', title: () => tr('Flight & format', 'Flight & Spielform'), about: () => tr('Players, their tees, kind of round, mode, scoring', 'Spieler, ihre Tees, Rundenart, Modus, Scoring'), length: '1:03' },
  { id: 'map', title: () => tr('On the round', 'Auf der Runde'), about: () => tr('Distances, weather, tools, your spread, all holes', 'Entfernungen, Wetter, Werkzeuge, Streuung, alle Löcher'), length: '0:51' },
  { id: 'caddie', title: () => tr('The caddie', 'Der Caddie'), about: () => tr('Club, plays like, ask, rules, hole notes', 'Schläger, spielt wie, Fragen, Regeln, Lochnotizen'), length: '0:34' },
  { id: 'score', title: () => tr('Shots & score', 'Schläge & Score'), about: () => tr('"Shot here", score and putts, next hole, finish', '„Schlag hier“, Score und Putts, nächstes Loch, beenden'), length: '0:33' },
  { id: 'review', title: () => tr('Check & sign', 'Prüfen & signieren'), about: () => tr('Shots on the map, club, strike and flight, "hole fits", summary', 'Schläge auf der Karte, Schläger, Treffer und Flugbahn, „Loch passt“, Fazit'), length: '0:54' },
  { id: 'stats', title: () => tr('Statistics & My golf', 'Statistik & Mein Golf'), about: () => tr('Strokes gained, clubs and spread, progress', 'Strokes Gained, Schläger und Streuung, Verlauf'), length: '0:42' },
  { id: 'profile', title: () => tr('Profile & account', 'Profil & Konto'), about: () => tr('My bag, all devices, notifications, help', 'Mein Bag, alle Geräte, Mitteilungen, Hilfe'), length: '0:35' },
  // the launch monitor (night run 27./28.10.2026): a session into the bag, its own page, the range in the stats
  { id: 'launch', title: () => tr('Launch monitor', 'Launch-Monitor'), about: () => tr('Import a session, the range page, range shots in the stats', 'Sitzung importieren, die Range-Seite, Range-Schläge in der Statistik'), length: '1:02' },
  // the Games module (night 25./26.10.2026 – Sascha tests Games next); not part of the Rounds tour
  { id: 'games', title: () => tr('Playing games', 'Games spielen'), about: () => tr('Format and favourites, players, scores on the map, settling up, balance', 'Spielform und Favoriten, Mitspieler, Scores auf der Karte, Abrechnung, Bilanz'), length: '1:06' },
];
/** The whole tour in one video. */
export const HELP_TOUR: HelpVideo = { id: 'tour', title: () => tr('The whole tour', 'Der ganze Rundgang'), about: () => tr('Everything in one video', 'Alles in einem Video'), length: '6:05' };

export const helpVideoUrl = (id: string): string => `help/${id}.mp4`;
export const helpPosterUrl = (id: string): string => `help/${id}.jpg`;
/** The subtitles as their own track – to switch on and off (Sascha 23.10.2026). */
export const helpSubsUrl = (id: string): string => `help/${id}.vtt`;

const SUBS_KEY = 'golfos.help.subs.v1';
export function loadSubs(): boolean {
  try {
    return localStorage.getItem(SUBS_KEY) !== '0';
  } catch {
    return true;
  }
}
export function saveSubs(on: boolean): void {
  try {
    localStorage.setItem(SUBS_KEY, on ? '1' : '0');
  } catch {
    // storage full – the choice holds while the page is open
  }
}

export interface Faq {
  q: () => string;
  a: () => string;
  /** the chapter that shows it */
  video: string;
}
export interface FaqTopic {
  id: string;
  title: () => string;
  items: Faq[];
}

export const FAQ: FaqTopic[] = [
  {
    id: 'round',
    title: () => tr('Before the round', 'Vor der Runde'),
    items: [
      {
        q: () => tr('How do I start a round?', 'Wie starte ich eine Runde?'),
        a: () =>
          tr(
            'Play → "New round", pick the course (nearby or by its name), the loops, your tee and the players, then "Start round".',
            'Spielen → „Neue Runde“, Platz wählen (in der Nähe oder per Name), dann Schleifen, dein Tee und die Spieler – und „Runde starten“.',
          ),
        video: 'start',
      },
      {
        q: () => tr('Where does my playing handicap come from?', 'Woher kommt meine Vorgabe?'),
        a: () =>
          tr(
            'From your handicap index (profile) with the course rating and slope of your tee. If the course has none in the app, enter them once from the scorecard – other players then get them too.',
            'Aus deinem Handicap-Index (Profil) mit Course Rating und Slope deines Tees. Kennt die App die Werte nicht, trägst du sie einmal von der Scorekarte ein – andere Spieler bekommen sie dann auch.',
          ),
        video: 'start',
      },
      {
        q: () => tr('What is the birdie book?', 'Was ist das Birdiebook?'),
        a: () =>
          tr(
            'Every hole on one page: the plan from the tee, hazards with their distances, the green, your record and your hole note. In the round setup.',
            'Jedes Loch auf einer Seite: der Plan vom Abschlag, Gefahren mit Entfernungen, das Grün, deine Bilanz und deine Lochnotiz. Zu finden beim Einrichten der Runde.',
          ),
        video: 'start',
      },
      {
        q: () => tr('Does the app work without a connection?', 'Geht die App ohne Netz?'),
        a: () =>
          tr(
            'Yes. Open the course once with a connection (e.g. at the hotel) and wait for "map kept offline ✓" – then the round works without network, and everything is sent later.',
            'Ja. Öffne den Platz einmal mit Netz (z. B. im Hotel-WLAN) und warte auf „Karte offline gespeichert ✓“ – dann läuft die Runde ohne Netz, abgeglichen wird später.',
          ),
        video: 'start',
      },
      {
        q: () => tr('How do I put GolfOS on the home screen?', 'Wie lege ich GolfOS auf den Home-Bildschirm?'),
        a: () =>
          tr('iPhone: open GolfOS in Safari → Share → "Add to Home Screen". It then opens like an app – needed for notifications.', 'iPhone: GolfOS in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Dann öffnet es sich wie eine App – nötig für Mitteilungen.'),
        video: 'profile',
      },
    ],
  },
  {
    id: 'course',
    title: () => tr('On the course', 'Auf dem Platz'),
    items: [
      {
        q: () => tr('Can I aim elsewhere or lay up on a par 3?', 'Kann ich auf einem Par 3 woanders hinzielen oder vorlegen?'),
        a: () =>
          tr(
            'Yes: drag the ring on the green – beside the flag or short of the green. Untouched, the caddie plans as usual; moved, he plays to your target.',
            'Ja: Zieh den Ring auf dem Grün – neben die Fahne oder vor das Grün. Unbewegt plant der Caddie wie gewohnt, verschoben spielt er auf dein Ziel.',
          ),
        video: 'map',
      },
      {
        q: () => tr('What is the green ellipse on the map?', 'Was ist die grüne Ellipse auf der Karte?'),
        a: () =>
          tr(
            'Your spread with the club: 8 of 10 balls land in it. From 5 checked shots it is yours (solid line); before that from your launch monitor data if you imported some, else an estimate from your handicap (dashed) – short clubs spread more in length, long ones more to the side. The cone symbol switches it on and off; the club next to it picks another one.',
            'Deine Streuung mit dem Schläger: 8 von 10 Bällen landen darin. Ab 5 geprüften Schlägen ist sie deine eigene (durchgezogen); vorher aus deinen Launch-Monitor-Daten, wenn du welche importiert hast, sonst nach Handicap geschätzt (gestrichelt) – kurze Schläger streuen mehr in der Länge, lange mehr zur Seite. Das Kegel-Symbol schaltet sie an und aus, der Schläger links daneben wählt einen anderen.',
          ),
        video: 'map',
      },
      {
        q: () => tr('Can I use the data of my launch monitor?', 'Kann ich Daten von meinem Launch-Monitor übernehmen?'),
        a: () =>
          tr(
            'Yes – Garmin R10, Trackman and Foresight: export the session as CSV in the device’s app and load it under Profile → My bag → "Import launch monitor data". "Use" takes the carries as measured; clubs not in the file stay as you entered them, a club the bag lacks can be added. Each session gets its own page – spread, gaps, flight, swing – and in Statistics the range shots can be shown beside the course’s.',
            'Ja – Garmin R10, Trackman und Foresight: Exportiere die Sitzung in der App des Geräts als CSV und lade sie unter Profil → Mein Bag → „Launch-Monitor-Daten importieren“. „Übernehmen“ setzt die Weiten so, wie gemessen; Schläger, die nicht in der Datei stehen, bleiben, wie du sie eingetragen hast, ein fehlender Schläger lässt sich hinzufügen. Jede Sitzung hat ihre eigene Seite – Streuung, Abstände, Flugbahn, Schwung –, und in der Statistik lassen sich die Range-Schläge neben die vom Platz legen.',
          ),
        video: 'profile',
      },
      {
        q: () => tr('What do the numbers top right mean?', 'Was bedeuten die Zahlen oben rechts?'),
        a: () => tr('The distances from where you stand to the back, middle and front of the green (GPS).', 'Die Entfernungen von deinem Standort bis hinten, Mitte und vorne aufs Grün (GPS).'),
        video: 'map',
      },
      {
        q: () => tr('What does "plays like" mean?', 'Was heißt „spielt wie“?'),
        a: () => tr('How long the shot plays today: with the wind, the temperature and up- or downhill.', 'Wie lang der Schlag heute spielt: mit Wind, Temperatur und bergauf oder bergab.'),
        video: 'caddie',
      },
      {
        q: () => tr('How are my shots recorded?', 'Wie werden meine Schläge erfasst?'),
        a: () =>
          tr(
            'The app records your way over the course and finds the shots after the round. More exact: tap "Shot here" at the ball before you hit.',
            'Die App zeichnet deinen Weg über den Platz auf und findet die Schläge nach der Runde. Genauer: Tippe beim Ball auf „Schlag hier“, bevor du schlägst.',
          ),
        video: 'score',
      },
      {
        q: () => tr('How do I enter the score?', 'Wie trage ich den Score ein?'),
        a: () => tr('On the green: tap the score at the bottom, then strokes and putts.', 'Auf dem Grün: unten auf den Score tippen, dann Schläge und Putts.'),
        video: 'score',
      },
      {
        q: () => tr('Can I pause a round?', 'Kann ich eine Runde unterbrechen?'),
        a: () => tr('Pull up the bar at the bottom → "Pause". On the start page "Continue".', 'Die Leiste unten hochziehen → „Pausieren“. Auf der Startseite „Fortsetzen“.'),
        video: 'map',
      },
      {
        // Sascha 29.10.2026: a scramble team on two phones, a tournament over several flights
        q: () => tr('Can my flight play on their phones too – or several flights as a tournament?', 'Kann mein Flight auf seinen Handys mitspielen – oder mehrere Flights als Turnier?'),
        a: () =>
          tr(
            'Yes, signed in: pull up the bar → "Invite players · tournament" makes a code and a QR code (switch on "Tournament" for several flights). The others tap "Join a friend\'s round" on the start page: your flight picks who it is – the same team works on two phones – another flight starts its own. The scores reach every phone within seconds; in a tournament the leaderboard shows all flights.',
            'Ja, angemeldet: Leiste hochziehen → „Mitspieler einladen · Turnier“ erzeugt einen Code und einen QR-Code (für mehrere Flights „Turnier“ einschalten). Die anderen tippen auf der Startseite „Runde beitreten“: Dein Flight wählt, wer er ist – dasselbe Team geht auch auf zwei Handys –, ein anderer Flight legt seinen eigenen an. Die Scores sind in Sekunden auf allen Handys; im Turnier zeigt das Leaderboard alle Flights.',
          ),
        video: 'map',
      },
      {
        q: () => tr('Why do I see a drawn hole instead of the aerial image?', 'Warum sehe ich eine gezeichnete Bahn statt des Luftbilds?'),
        a: () => tr('When the aerial image service does not answer, the app draws the hole. "2D" switches by hand.', 'Wenn der Luftbild-Dienst gerade nicht antwortet, zeichnet die App die Bahn. Mit „2D“ wechselst du von Hand.'),
        video: 'map',
      },
    ],
  },
  {
    id: 'caddie',
    title: () => tr('The caddie', 'Der Caddie'),
    items: [
      {
        q: () => tr('What does the caddie tell me?', 'Was sagt mir der Caddie?'),
        a: () => tr('The club, the distance, how long it plays, his plan and the one danger that matters.', 'Den Schläger, die Entfernung, wie lang es spielt, seinen Plan und die eine Gefahr, auf die es ankommt.'),
        video: 'caddie',
      },
      {
        q: () => tr('Can I ask him something?', 'Kann ich ihn etwas fragen?'),
        a: () => tr('"Ask": tap a question or "Ask with your voice" – a short pause ends your question.', '„Fragen“: eine Frage antippen oder „Per Sprache fragen“ – eine kurze Pause beendet deine Frage.'),
        video: 'caddie',
      },
      {
        q: () => tr('What are hole notes?', 'Was sind Lochnotizen?'),
        a: () =>
          tr(
            'What you know about a hole that no map shows – out of bounds, a blind tee shot. They count for the course in every round; a green dot shows there is one.',
            'Was du über ein Loch weißt, das keine Karte zeigt – Aus, ein blinder Abschlag. Sie gelten für den Platz in jeder Runde; ein grüner Punkt zeigt, dass es eine gibt.',
          ),
        video: 'caddie',
      },
      {
        q: () => tr('Why does the caddie not read aloud?', 'Warum liest der Caddie nicht vor?'),
        a: () => tr('On the iPhone the browser follows the silent switch: switch the sound on.', 'Auf dem iPhone folgt der Browser dem Lautlos-Schalter: Ton einschalten.'),
        video: 'caddie',
      },
      {
        q: () => tr('And in a tournament?', 'Und im Turnier?'),
        a: () => tr('Round type "Tournament": no advice (Rule 4.3) – only your notes and the distances.', 'Rundenart „Turnier“: keine Ratschläge (Regel 4.3) – nur deine Notizen und die Entfernungen.'),
        video: 'start',
      },
    ],
  },
  {
    id: 'after',
    title: () => tr('After the round', 'Nach der Runde'),
    items: [
      {
        q: () => tr('Which strike and flight should I choose?', 'Welchen Treffer und welche Flugbahn wähle ich?'),
        a: () =>
          tr(
            'Strike is the contact: good, fat, thin, topped, toe, heel or shank – only good strikes teach the app your distances. Flight is where the ball went: the nine of the ball flight laws plus draw and fade. Both are optional.',
            'Treffer ist der Kontakt: gut, fett, dünn, getoppt, Spitze, Hacke oder Shank – nur gute Treffer lehren die App deine Weiten. Flugbahn ist, wohin der Ball flog: die neun der Ballflug-Gesetze plus Draw und Fade. Beides ist freiwillig.',
          ),
        video: 'review',
      },
      {
        q: () => tr('What does the putter show in the statistics?', 'Was zeigt der Putter in der Statistik?'),
        a: () =>
          tr(
            'How often your putts go in from each distance, how many putts a hole took by the length of the first one, up to where every second putt drops and from where 3-putts come. It learns from the putts you place on the green when checking.',
            'Wie oft deine Putts aus welcher Entfernung fallen, wie viele Putts ein Loch nach der Länge des ersten brauchte, bis wohin jeder zweite fällt und ab wo 3-Putts kommen. Er lernt aus den Putts, die du beim Prüfen auf dem Grün setzt.',
          ),
        video: 'stats',
      },
      {
        q: () => tr('Why does a shot say "played like 152 m"?', 'Warum steht bei einem Schlag „spielte sich wie 152 m“?'),
        a: () =>
          tr(
            'Wind and temperature made the shot play longer or shorter. Into a strong wind 130 m can play like 150 m – then a 6-iron was right. The club suggested and your measured distances count with the wind taken out.',
            'Wind und Temperatur haben den Schlag länger oder kürzer gemacht. In starken Gegenwind spielen 130 m wie 150 m – dann war das Eisen 6 richtig. Der vorgeschlagene Schläger und deine gemessenen Weiten rechnen den Wind heraus.',
          ),
        video: 'review',
      },
      {
        q: () => tr('Why check and sign a round?', 'Warum prüfen und signieren?'),
        a: () => tr('Only signed rounds count in the statistics. Checking puts the shots right – club, lie and how you hit them.', 'Nur signierte Runden zählen in der Statistik. Beim Prüfen stimmen danach Schläge, Schläger, Lage und Treffer.'),
        video: 'review',
      },
      {
        q: () => tr('How do I check the shots?', 'Wie prüfe ich die Schläge?'),
        a: () =>
          tr(
            'Per hole: drag a shot on the map to its place, tap it for club and lie, then "Hole fits ✓". After the last hole the app shows only the holes still open.',
            'Je Loch: einen Schlag auf der Karte an seine Stelle ziehen, antippen für Schläger und Lage, dann „Loch passt ✓“. Nach dem letzten Loch zeigt die App nur noch die offenen.',
          ),
        video: 'review',
      },
      {
        q: () => tr('What is strokes gained?', 'Was ist Strokes Gained?'),
        a: () => tr('How many strokes you gain or lose per part of the game against your comparison group.', 'Wie viele Schläge du je Spielbereich gegen deine Vergleichsgruppe gewinnst oder verlierst.'),
        video: 'stats',
      },
      {
        q: () => tr('Where are my distances per club?', 'Wo finde ich meine Weiten je Schläger?'),
        a: () => tr('Profile → My bag. The app learns them from your good strikes in calm weather and suggests them.', 'Profil → Mein Bag. Die App lernt sie aus deinen guten Treffern bei Windstille und schlägt sie vor.'),
        video: 'profile',
      },
    ],
  },
  {
    id: 'games',
    title: () => tr('Games', 'Games'),
    items: [
      {
        q: () => tr('Which games are there?', 'Welche Spiele gibt es?'),
        a: () =>
          tr(
            'Skins, Wolf, Nassau, Las Vegas, Chicago, match play and more – each explains its rules, to read or to listen to. A star keeps your favourites on top.',
            'Skins, Wolf, Nassau, Las Vegas, Chicago, Lochspiel und mehr – jedes erklärt seine Regeln, zum Lesen oder Vorlesen. Mit dem Stern stehen deine Lieblingsspiele oben.',
          ),
        video: 'games',
      },
      {
        q: () => tr('How is it settled?', 'Wie wird abgerechnet?'),
        a: () =>
          tr(
            'At the end the app works out who pays whom – with as few payments as possible. Confirmed games count in your balance, against each friend.',
            'Am Ende rechnet die App aus, wer wem wie viel zahlt – mit möglichst wenigen Zahlungen. Bestätigte Spiele zählen in deiner Bilanz, gegen jeden Mitspieler.',
          ),
        video: 'games',
      },
      {
        q: () => tr('Can my friends keep score on their own phones?', 'Können Mitspieler auf ihrem Handy mitzählen?'),
        a: () =>
          tr(
            'Yes, signed in: pull up the bar → "Invite players" makes a code and a QR code. Your friends scan it or tap "Join a friend\'s game" and pick who they are. The scores and the standing reach every phone within seconds – as a round in Rounds.',
            'Ja, angemeldet: Leiste hochziehen → „Mitspieler einladen“ erzeugt einen Code und einen QR-Code. Deine Mitspieler scannen ihn oder tippen „Spiel beitreten“ und wählen, wer sie sind. Scores und Stand sind in Sekunden auf allen Handys – wie bei einer Runde in Rounds.',
          ),
        video: 'games',
      },
    ],
  },
  {
    id: 'account',
    title: () => tr('Account & data', 'Konto & Daten'),
    items: [
      {
        q: () => tr('Do I need an account?', 'Brauche ich ein Konto?'),
        a: () =>
          tr(
            'No – without one everything stays on this phone. With an account (Google or a user name) rounds and settings are the same on all your devices, by themselves.',
            'Nein – ohne Konto bleibt alles auf diesem Handy. Mit Konto (Google oder Benutzername) sind Runden und Einstellungen auf all deinen Geräten gleich, ganz von selbst.',
          ),
        video: 'profile',
      },
      {
        q: () => tr('Which notifications are there?', 'Welche Mitteilungen gibt es?'),
        a: () => tr('A round not checked yet, games on several phones, a thunderstorm on the course. Profile → Notifications.', 'Runde noch nicht geprüft, Spiele auf mehreren Handys, Gewitter auf dem Platz. Profil → Mitteilungen.'),
        video: 'profile',
      },
      {
        q: () => tr('How do I get my data?', 'Wie bekomme ich meine Daten?'),
        a: () => tr('Profile → Your data → Export: one file with rounds, games, profile and bag.', 'Profil → Deine Daten → Export: eine Datei mit Runden, Spielen, Profil und Bag.'),
        video: 'profile',
      },
      {
        q: () => tr('How do I delete my account?', 'Wie lösche ich mein Konto?'),
        a: () => tr('At the very bottom of the profile. The data on your phone stay.', 'Ganz unten im Profil. Die Daten auf deinem Handy bleiben.'),
        video: 'profile',
      },
    ],
  },
];
