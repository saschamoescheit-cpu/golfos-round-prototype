import { tr } from './i18n';
import { isNative } from './native';

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
  { id: 'games', title: () => tr('Playing games', 'Games spielen'), about: () => tr('Format and favourites, players, scores on the map, settling up, balance, swipe to delete', 'Spielform und Favoriten, Mitspieler, Scores auf der Karte, Abrechnung, Bilanz, Löschen per Wischen'), length: '1:15' },
  // bets and tournaments in Games (night run 01./02.11.2026) – their own videos, not part of the Rounds tour
  { id: 'wagers', title: () => tr('Bets', 'Wetten'), about: () => tr('A pool over the trip, the library, own bets, start the round, the standing, the settlement', 'Ein Pool über die Reise, die Bibliothek, eigene Wetten, Runde starten, der Stand, die Abrechnung'), length: '1:28' },
  { id: 'tours', title: () => tr('Tournaments', 'Turniere'), about: () => tr('Flights with their tee times, players moved, markers, special prizes, live leaderboard', 'Flights mit Startzeit, Spieler verschieben, Zähler, Sonderwertungen, Live-Rangliste'), length: '1:24' },
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
          isNative()
            ? tr('You are using the app already – nothing to do.', 'Du nutzt schon die App – hier ist nichts zu tun.')
            : tr('iPhone: open GolfOS in Safari → Share → "Add to Home Screen". It then opens like an app – needed for notifications.', 'iPhone: GolfOS in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Dann öffnet es sich wie eine App – nötig für Mitteilungen.'),
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
        q: () => tr('Can my flight play on their phones too?', 'Kann mein Flight auf seinen Handys mitspielen?'),
        a: () =>
          tr(
            'Yes, signed in: when you set up the round, under "Invite players", "Create a code" makes a code and a QR code – also later in the round: pull up the bar → "Invite players". Every round can – social as well; tournaments over several flights are planned in the module Tournaments. The others tap "Join a friend\'s round": nearby (about 300 m, for two hours) the round shows at the top, a tap is enough – else the code. No account needed – the name is enough; you let each one in (several: "Let all in"), a push tells you. Your flight picks who it is. Under "Score entry" you choose who enters the scores: everyone his own (the default; strokes, putts, penalties); "With a marker" – everyone also marks a partner, a difference shows (in a tournament always); or "One for all" – one player enters every card, the others see it live. In scramble and foursomes one keeps the team\'s card, another can take it over. The leaderboard shows the flight live.',
            'Ja, angemeldet: Beim Einrichten der Runde unter „Mitspieler einladen“ erzeugt „Code erzeugen“ einen Code und einen QR-Code – auch später in der Runde: Leiste hochziehen → „Mitspieler einladen“. Das geht bei jeder Runde, auch Social; Turniere über mehrere Flights planst du im Modul Tournaments. Die anderen tippen „Runde beitreten“: In der Nähe (etwa 300 m, zwei Stunden lang) steht die Runde ganz oben, ein Tipp genügt – sonst der Code. Ein Konto brauchen sie nicht – der Name genügt; du bestätigst jeden Beitritt (bei mehreren: „Alle zulassen“), eine Mitteilung sagt es dir. Dein Flight wählt, wer er ist. Unter „Score-Erfassung“ wählst du, wer die Scores erfasst: „Jeder seinen eigenen“ (Standard) (Schläge, Putts, Strafschläge); „Mit Zähler“ – jeder zählt dazu einen Mitspieler, eine Abweichung wird angezeigt (im Turnier immer); oder „Einer für alle“ – ein Spieler trägt alle Scorecards ein, die anderen sehen alles live. Bei Scramble und Vierer führt einer die Scorecard des Teams, ein anderer kann sie übernehmen. Das Leaderboard zeigt den Flight live.',
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
            'Skins, Wolf, Nassau, 5+5+10, Las Vegas, Chicago, match play and more – each explains its rules, to read or to listen to. A star keeps your favourites on top.',
            'Skins, Wolf, Nassau, 5+5+10, Las Vegas, Chicago, Lochspiel und mehr – jedes erklärt seine Regeln, zum Lesen oder Vorlesen. Mit dem Stern stehen deine Lieblingsspiele oben.',
          ),
        video: 'games',
      },
      {
        q: () => tr('How do I see what I owe – and mark it paid?', 'Wie sehe ich, was ich schulde – und markiere es als bezahlt?'),
        a: () =>
          tr(
            'Games & Bets → "Balance": "Open amounts" shows what you owe and what you are owed. Tap a player: each game and pool between you, how it stood, together. "Paid" when you paid him – he sees it and confirms with "Received"; "Received" books out what someone gave you. ↺ takes a payment back.',
            'Games & Bets → „Bilanz“: Unter „Offene Beträge“ steht, was du schuldest und was dir geschuldet wird. Tippe auf einen Mitspieler: jedes Spiel und jede Wette zwischen euch, wie es stand, zusammen. „Bezahlt“, wenn du ihm gezahlt hast – er sieht es und bestätigt mit „Erhalten“; mit „Erhalten“ buchst du aus, was dir jemand gegeben hat. ↺ nimmt eine Zahlung zurück.',
          ),
        video: 'games',
      },
      {
        q: () => tr('Can we play for drinks instead of money?', 'Können wir auch um Getränke statt um Geld spielen?'),
        a: () =>
          tr(
            'Yes, in the bets: "Played for" – money (then euro or dollar), drinks, a meal, cleaning the clubs, your own stake typed – or no stake, for the honour. For a thing you choose who buys for whom: counted per bet lost ("2 × drink"), the loser for all, or the loser for the winner.',
            'Ja, bei den Wetten: „Worum wird gespielt“ – Geld (dann Euro oder Dollar), Getränke, Essen, Schläger putzen, ein eigener Einsatz oder ohne Einsatz, um die Ehre. Bei einem Ding wählst du, wer wem ausgibt: je verlorene Wette gezählt („2 × Getränk“), der Verlierer für alle oder der Verlierer für den Sieger.',
          ),
        video: 'wagers',
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
      {
        // Sascha 01.11.2026: the bets of the US trip – everyone his own targets
        q: () => tr('Can we set up bets over a trip – everyone his own targets?', 'Können wir Wetten über eine Reise anlegen – jeder seine eigenen Ziele?'),
        a: () =>
          tr(
            'Yes: Games & Bets → menu "Bets" (or "New bet" under "Play") – a name, the days, the players (with their HCP, as in "Start the round"); the pencil at the top changes or deletes the pool – only for whoever set it up: the invited see the bets, their phones report theirs. Then "+ Bets" at a player opens his library: tick the bets (in a row, in one round at least or at most, the score, on the whole trip, or a free bet in words) and set the numbers – under "Own bets" you build your own (what counts, at least or at most, on which holes), the app judges them; once there are bets, "Set up before" offers them as templates. Stake, payout and attempts per bet – tap it; "with marker" holds for the whole pool (the pencil at the top). Every change is saved at once – "Save" at the bottom takes you back, carry on any time later. "Start the round" in the pool starts it right there – course and players taken over, the bets judged live; the score entry asks for the details only where a bet needs them. Invite with the code; whoever plays on his own phone, his phone reports his bets. "With marker": a flight partner marks him (or one keeps the score of all) – until both have signed, a result is provisional. The settlement says who pays whom – whoever paid taps "Paid", whoever got it "Received"; below it says what is paid already.',
            'Ja: Games & Bets → Menü „Wetten“ (oder unter „Spielen“ „Neue Wette“) – Name, Tage, Spieler (mit HCP, wie bei „Runde starten“); der Stift oben ändert oder löscht den Pool – nur für den, der ihn angelegt hat: die Eingeladenen sehen die Wetten, ihr Handy meldet ihre. Dann „+ Wetten“ beim Spieler öffnet seine Bibliothek: Wetten ankreuzen (in Folge, in einer Runde mindestens oder höchstens, Ergebnis, auf der ganzen Reise oder eine freie Wette in Worten) und die Zahlen einstellen – unter „Eigene Wetten“ baust du eigene (was zählt, mindestens oder höchstens, auf welchen Löchern), die App wertet sie aus; gibt es schon Wetten, bietet „Schon angelegt“ sie als Vorlage an. Einsatz, Auszahlung und Versuche sind je Wette einstellbar – Wette antippen; „Mit Zähler“ gilt für den ganzen Pool (Stift oben). Jede Änderung ist sofort gespeichert – „Speichern“ unten führt zurück, weiter bearbeiten geht jederzeit. „Runde starten“ im Pool startet die Runde direkt – Platz und Mitspieler übernommen, die Wetten live ausgewertet; die Erfassung fragt Details nur ab, wo eine Wette sie braucht. Mit dem Code einladen; wer auf seinem Handy spielt, dessen Handy meldet seine Wetten. „Mit Zähler“: Ein Flightpartner zählt ihn (oder einer erfasst für alle) – bis beide unterschrieben haben, gilt ein Ergebnis als vorläufig. Die Abrechnung sagt, wer wem zahlt – wer bezahlt hat, tippt „Bezahlt“, wer es bekommen hat, „Erhalten“; darunter steht, was schon bezahlt ist.',
          ),
        video: 'wagers',
      },
      {
        // Sascha 01.11.2026: tournaments planned in Games, played in Rounds
        q: () => tr('Can I plan a tournament ahead – flights, markers, tee times?', 'Kann ich ein Turnier vorab planen – Flights, Zähler, Startzeiten?'),
        a: () =>
          tr(
            'Yes: Tournaments (on the start page) → "New tournament" – the name, the day, the course and the scoring (gross, net or Stableford, net classes if you like), the players with their HCP. "+ Flight" creates a flight: its tee time to the minute (12:08), then its players – four at most; the next flight offers only those not in a flight yet ("Share out" does it at once). Who marks whom, the app sets and shows; "Change" opens a flight again. Invite with the code or link: whoever has it is in. On the day the tournament shows in Rounds from 00:01 – "take part", pick yourself, play; the live leaderboard runs in Rounds and on the tournament\'s page in Tournaments. Only whoever set it up changes or deletes it.',
            'Ja: Tournaments (auf der Startseite) → „Neues Turnier“ – Name, Tag, Platz und Wertung (brutto, netto oder Stableford, auf Wunsch Netto-Klassen), die Spieler mit HCP. „+ Flight“ legt einen Flight an: seine Startzeit auf die Minute genau (12:08), dann seine Spieler – höchstens vier; der nächste Flight bietet nur noch die Spieler ohne Flight an („Automatisch einteilen“ macht es in einem Schritt). Wer wen zählt, legt die App fest und zeigt es an; „Ändern“ öffnet einen Flight wieder. Mit Code oder Link einladen: Wer ihn hat, ist dabei. Am Turniertag steht das Turnier ab 00:01 in Rounds – „teilnehmen“, sich wählen, spielen; die Live-Rangliste läuft in Rounds und auf der Turnierseite in Tournaments. Ändern oder löschen kann nur, wer es angelegt hat.',
          ),
        video: 'tours',
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
      // friends linked by their accounts (Sascha 02.11.2026)
      {
        q: () => tr("How does a friend's handicap stay up to date?", 'Wie bleibt das HCP meiner Freunde aktuell?'),
        a: () =>
          tr(
            'Link them: Friends → "My friend code" – let your friend scan the QR code ("Scan QR code" on his phone) or send him the invitation, e.g. by WhatsApp; he accepts. Then name, handicap, home club and photo come from his profile, and you both see each other. The chain marks a linked friend, the pen one typed by hand – you can still add friends by hand. Far away? "Type code" takes the 6 digits under his QR code (123-456); where the camera shows no picture, "Take a photo of the code" reads it from a photo. To remove a friend, swipe him to the left – "Undo" brings him back. Linking needs an account (Google or user name).',
            'Verknüpfe sie: Freunde → „Mein Freundes-Code“ – dein Freund scannt den QR-Code („QR-Code scannen“ auf seinem Handy) oder du schickst ihm die Einladung, z. B. per WhatsApp; er nimmt an. Dann kommen Name, HCP, Heimatclub und Bild aus seinem Profil, und ihr seht euch gegenseitig. Die Kette zeigt verknüpfte Freunde, der Stift von Hand angelegte – Freunde von Hand anlegen geht weiterhin. Weit weg? „Code eingeben“ nimmt die 6 Ziffern unter seinem QR-Code (123-456); zeigt die Kamera kein Bild, liest „Foto vom Code aufnehmen“ ihn aus einem Foto. Einen Freund entfernst du, indem du ihn nach links wischst – „Rückgängig“ holt ihn zurück. Zum Verknüpfen braucht es ein Konto (Google oder Benutzername).',
          ),
        video: 'profile',
      },
      {
        q: () => tr('Which notifications are there?', 'Welche Mitteilungen gibt es?'),
        a: () => tr('A round not checked yet, games on several phones, a bet made, your tee time about 45 minutes ahead, a thunderstorm on the course. Profile → Notifications.', 'Runde noch nicht geprüft, Spiele auf mehreren Handys, eine geschaffte Wette, deine Startzeit etwa 45 Minuten vorher, Gewitter auf dem Platz. Profil → Mitteilungen.'),
        video: 'profile',
      },
      {
        q: () => tr('How do I get my data?', 'Wie bekomme ich meine Daten?'),
        a: () => tr('Profile → Your data → Export: one file with rounds, games, profile and bag.', 'Profil → Deine Daten → Export: eine Datei mit Runden, Spielen, Profil und Bag.'),
        video: 'profile',
      },
      {
        q: () => tr('How do I delete a round, a game or a bet?', 'Wie lösche ich eine Runde, ein Spiel oder eine Wette?'),
        a: () =>
          tr(
            'Swipe it to the left in its list, as an e-mail: the red bin shows – tap it. Swiped all the way across it goes at once. It goes into the bin: "Undo" right away, later "Restore" under the tile "deleted". A pool of bets or a tournament only its host deletes – for everyone. The same for training sessions and screenings.',
            'In der Liste nach links wischen, wie eine E-Mail: Der rote Mülleimer erscheint – antippen. Ganz durchgewischt ist es sofort weg. Es landet im Papierkorb: gleich „Rückgängig“, später „Wiederherstellen“ unter der Kachel „gelöscht“. Einen Wett-Pool oder ein Turnier löscht nur, wer es angelegt hat – für alle. Genauso bei Trainingseinheiten und Screenings.',
          ),
        video: 'games',
      },
      {
        q: () => tr('How do I delete my account?', 'Wie lösche ich mein Konto?'),
        a: () => tr('At the very bottom of the profile. The data on your phone stay.', 'Ganz unten im Profil. Die Daten auf deinem Handy bleiben.'),
        video: 'profile',
      },
    ],
  },
];
