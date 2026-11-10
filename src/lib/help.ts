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
  { id: 'games', title: () => tr('Playing games', 'Games spielen'), about: () => tr('Format and favourites, players, scores on the map, settling up, balance, swipe to delete', 'Spielform und Favoriten, Mitspieler, Scores auf der Karte, Abrechnung, Bilanz, Löschen per Wischen'), length: '1:22' },
  // bets and tournaments in Games (night run 01./02.11.2026) – their own videos, not part of the Rounds tour
  { id: 'wagers', title: () => tr('Bets', 'Wetten'), about: () => tr('A pool over the trip, the library, own bets, inviting right at a player, start the round, the standing, the settlement', 'Ein Pool über die Reise, die Bibliothek, eigene Wetten, beim Spieler einladen, Runde starten, der Stand, die Abrechnung'), length: '1:43' },
  { id: 'tours', title: () => tr('Tournaments', 'Turniere'), about: () => tr('The draw and the tee times, players moved, several rounds, special prizes, live leaderboard', 'Einteilung und Startzeiten, Spieler verschieben, mehrere Runden, Sonderwertungen, Live-Leaderboard'), length: '1:44' },
  // the balance and a tournament over several rounds (Sascha 04.11.2026)
  { id: 'balance', title: () => tr('Balance', 'Bilanz'), about: () => tr('Tiles and their filter, open amounts, a player\'s games, Paid and Received', 'Kacheln und Filter, offene Beträge, die Spiele mit einem Mitspieler, Bezahlt und Erhalten'), length: '0:34' },
  { id: 'tourrounds', title: () => tr('A tournament over several rounds', 'Turnier über mehrere Runden'), about: () => tr('Rounds, cut, the final dealt by result, the scorecards in the leaderboard', 'Runden, Cut, Finalrunde nach Ergebnis, Scorekarten im Leaderboard'), length: '0:58' },
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
        q: () => tr('A hole has no map – what now?', 'Ein Loch hat keine Karte – was tun?'),
        a: () =>
          tr(
            'Tap the tee and then the green on the aerial photo and save – the hole is there from then on. Or "Enter score only": every hole without a map then opens on the score entry for the rest of the round; "Set up the hole" at the top still draws one in. Playing together on several phones, one is enough: the hole set up goes to the others of the round (a tournament: every flight) – where they have none of their own.',
            'Abschlag und dann Grün auf dem Luftbild antippen und speichern – ab dann ist das Loch da. Oder „Nur Score eintragen“: Für den Rest der Runde öffnet jedes Loch ohne Karte gleich die Score-Eingabe; „Loch einrichten“ oben zeichnet trotzdem eins ein. Spielt ihr auf mehreren Handys zusammen, reicht einer: Das eingerichtete Loch geht an die anderen der Runde (im Turnier an alle Flights) – wo sie kein eigenes haben.',
          ),
        video: 'start',
      },
      {
        // Sascha 10.11.2026: "beside the arrow for back, swipe one level back"
        q: () => tr('How do I go back – is there a swipe?', 'Wie komme ich zurück – geht das auch mit Wischen?'),
        a: () =>
          tr(
            'The arrow at the top left – or swipe from the left edge of the screen to the right, as everywhere on the iPhone: an open sheet closes first, then one level back.',
            'Mit dem Pfeil oben links – oder vom linken Bildschirmrand nach rechts wischen, wie überall auf dem iPhone: Ein offenes Blatt schließt sich zuerst, dann geht es eine Ebene zurück.',
          ),
        video: 'start',
      },
      {
        q: () => tr('Can I use my Apple Watch?', 'Kann ich meine Apple Watch nutzen?'),
        a: () =>
          tr(
            'Yes, in the iPhone app with an Apple Watch Series 8 or later (older ones work too, without feeling the ball). Install GolfOS on the watch (Watch app on the iPhone → GolfOS → Install). When you start a round – or a game on the map, it counts the shots there too –, the watch app opens with a golf workout: it shows the hole and the distances to the front, middle and back of the green from where you stand, and it feels every swing – each one is a shot of the round at the watch\'s place, also when the phone lies in the cart. Practice swings at the same spot count once. Bumps while driving in the cart do not count either: a swing while the watch moves faster than walking (9 km/h) is no shot. A shot’s place is the mean of the watch’s fixes while you stood at the ball – more exact than one fix. When the phone lies in the cart, the map and the distances follow the watch: it sends its place every few seconds. The phone’s microphone does not count the range’s cracks before the round either. Warming up on the range before the round does not count: before the first shot, a swing far from every tee – or more than 10 minutes before a tournament’s tee time – is not a shot. A wrong one: tap the arrow on the watch to take it back; + notes a shot by hand. Putts come from the score. The watch also listens for the crack of the hit (nothing is recorded): a swing with its crack is a shot for sure, a short chip counts with its crack – allow the microphone on the watch; without it the motion alone counts. It keeps its own GPS track too – the round’s way is the watch’s, not the cart’s. Swiped up: the hole as a picture – fairways, bunkers, water, the green and where you stand, the distance over it.',
            'Ja, in der iPhone-App mit einer Apple Watch ab Series 8 (ältere gehen auch, spüren aber den Ball nicht). GolfOS auf der Uhr installieren (Watch-App auf dem iPhone → GolfOS → Installieren). Beim Start einer Runde – oder eines Spiels auf der Karte, auch dort zählt sie die Schläge – öffnet sich die Uhr-App mit einem Golf-Training: Sie zeigt das Loch und die Entfernungen bis Grün vorne, Mitte und hinten von deinem Standort – und spürt jeden Schwung. Jeder wird ein Schlag der Runde an der Stelle der Uhr, auch wenn das Handy im Cart liegt. Probeschwünge an derselben Stelle zählen einmal. Bodenwellen beim Fahren im Cart zählen auch nicht: Ein Schwung, während sich die Uhr schneller als Gehtempo (9 km/h) bewegt, ist kein Schlag. Der Ort eines Schlags ist das Mittel der Uhr-Positionen, während du am Ball standest – genauer als ein einzelner Punkt. Liegt das Handy im Cart, folgen Karte und Entfernungen der Uhr: Sie schickt ihre Position alle paar Sekunden. Auch das Handy-Mikrofon zählt die Knalle auf der Range vor der Runde nicht. Einspielen auf der Range vor der Runde zählt nicht: Vor dem ersten Schlag ist ein Schwung weit weg von jedem Abschlag – oder mehr als 10 Minuten vor der Startzeit eines Turniers – kein Schlag. Einer zu viel: auf der Uhr den Pfeil tippen und er ist weg; + erfasst einen Schlag von Hand. Putts kommen aus dem Score. Die Uhr hört außerdem auf den Treffmoment (es wird nichts aufgenommen): Ein Schwung mit Knall ist sicher ein Schlag, ein kurzer Chip zählt mit seinem Knall – dafür auf der Uhr das Mikrofon erlauben; ohne zählt die Bewegung allein. Sie zeichnet auch ihre eigene GPS-Spur auf – der Weg der Runde ist der der Uhr, nicht der des Carts. Nach oben gewischt: das Loch als Bild – Fairways, Bunker, Wasser, Grün und dein Standort, die Entfernung darüber.',
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
        // Sascha 12.11.2026, on the course: a player had to stop after 8 holes
        q: () => tr('A player has to stop – what then?', 'Ein Spieler muss abbrechen – was nun?'),
        a: () =>
          tr(
            'In the score entry tap his name → "Give up". From the next hole on (or this one, without a score yet) he is not scored any more; his holes up to there stay and can be signed. The leaderboard shows "WD after 8": Stableford counts his points, stroke play ranks him below without a total. "Plays on" in his line takes it back.',
            'In der Score-Erfassung auf seinen Namen tippen → „Aufgeben“. Ab dem nächsten Loch (oder diesem, wenn es noch keinen Score hat) wird er nicht mehr erfasst; seine Löcher bis dahin bleiben und lassen sich unterschreiben. Das Leaderboard zeigt „Aufg. nach 8“: Stableford zählt seine Punkte, im Zählspiel steht er ohne Wertung unten. „Spielt weiter“ in seiner Zeile nimmt es zurück.',
          ),
        video: 'score',
      },
      {
        // Sascha 29.10.2026: a scramble team on two phones, a tournament over several flights
        q: () => tr('Can my flight play on their phones too?', 'Kann mein Flight auf seinen Handys mitspielen?'),
        a: () =>
          tr(
            'Yes, signed in: when you set up the round, under "Invite players", "Create a code" makes a code and a QR code – also later in the round: pull up the bar → "Invite players". Every round can – social as well; tournaments over several flights are planned in the module Tournaments. The others tap "Join a friend\'s round": nearby (about 300 m, for two hours) the round shows at the top, a tap is enough – else the code. No account needed – the name is enough; you let each one in (several: "Let all in"), a push tells you. Your flight picks who it is. Under "Score entry" you choose who enters the scores: everyone his own (the default; strokes, putts, penalties); "With a marker" – everyone also marks a partner, a difference shows (in a tournament always); or "One for all" – one player enters every card, the others see it live, and at the end he signs once – his own card and the count of the others – then everyone gets a push and signs his own card on his own phone (no marker per player); whoever also wants his putts, tee shot and sand for his own analysis gets "Own details" (per player in the setup, switched on his own phone). In scramble and foursomes one keeps the team\'s card, another can take it over. The leaderboard shows the flight live.',
            'Ja, angemeldet: Beim Einrichten der Runde unter „Mitspieler einladen“ erzeugt „Code erzeugen“ einen Code und einen QR-Code – auch später in der Runde: Leiste hochziehen → „Mitspieler einladen“. Das geht bei jeder Runde, auch Social; Turniere über mehrere Flights planst du im Modul Tournaments. Die anderen tippen „Runde beitreten“: In der Nähe (etwa 300 m, zwei Stunden lang) steht die Runde ganz oben, ein Tipp genügt – sonst der Code. Ein Konto brauchen sie nicht – der Name genügt; du bestätigst jeden Beitritt (bei mehreren: „Alle zulassen“), eine Mitteilung sagt es dir. Dein Flight wählt, wer er ist. Unter „Score-Erfassung“ wählst du, wer die Scores erfasst: „Jeder seinen eigenen“ (Standard) (Schläge, Putts, Strafschläge); „Mit Zähler“ – jeder zählt dazu einen Mitspieler, eine Abweichung wird angezeigt (im Turnier immer); oder „Einer für alle“ – ein Spieler trägt alle Scorecards ein, die anderen sehen alles live, und am Ende unterschreibt er einmal – seine Karte und die Zählung der anderen –, danach bekommt jeder eine Mitteilung und unterschreibt seine eigene Karte auf seinem Handy; erst dann ist die Runde abgegeben (keine Zähler je Spieler); wer zusätzlich Putts, Abschlag und Sand für die eigene Auswertung erfassen will, bekommt „Eigene Detailerfassung“ (je Spieler im Setup, auf dem eigenen Handy umschaltbar). Bei Scramble und Vierer führt einer die Scorecard des Teams, ein anderer kann sie übernehmen. Das Leaderboard zeigt den Flight live.',
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
        a: () => tr('Round type "Tournament": no advice (Rule 4.3) – only your notes and the distances. An internal tournament: switch on "All functions" in the format (in the round setup or when planning the tournament) – wind, caddie and green slopes as in any round, for everyone in it.', 'Rundenart „Turnier“: keine Ratschläge (Regel 4.3) – nur deine Notizen und die Entfernungen. Internes Turnier: im Format „Alle Funktionen“ einschalten (beim Einrichten der Runde oder beim Planen des Turniers) – Wind, Caddie und Grün-Slopes wie in jeder Runde, für alle im Turnier.'),
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
        // Sascha 08.11.2026: "the game's details belong into the score entry"
        q: () => tr('Where do I enter the wolf’s partner, Bingo Bango Bongo or a press?', 'Wo trage ich Wolf-Partner, Bingo Bango Bongo oder Press ein?'),
        a: () =>
          tr(
            'Right with the score: playing on the map, tap the hole’s score – below the players’ strokes "The game on this hole" asks what the game needs (the wolf’s partner, Bingo, Bango, Bongo, hammer, press …). The bar above the hole bar shows the same with the standing and the rules – for what is decided before the hole.',
            'Direkt beim Score: Auf der Karte den Score des Lochs antippen – unter den Schlägen der Spieler fragt „Das Spiel an diesem Loch“, was das Spiel braucht (Wolf-Partner, Bingo, Bango, Bongo, Hammer, Press …). Die Leiste über der Lochleiste zeigt dasselbe mit Stand und Regeln – für das, was vor dem Loch entschieden wird.',
          ),
        video: 'games',
      },
      {
        q: () => tr('How do I see what I owe – and mark it paid?', 'Wie sehe ich, was ich schulde – und markiere es als bezahlt?'),
        a: () =>
          tr(
            'Games & Bets → "Balance": "Open amounts" shows what you owe and what you are owed. Tap a player: each game and pool between you, how it stood, together. "Paid" when you paid him – he sees it and confirms with "Received"; "Received" books out what someone gave you. ↺ takes a payment back. The tiles on top filter: "wins", "lost" or "bets" tapped shows just those games and bets – tap one to open it, tap the tile again for everything.',
            'Games & Bets → „Bilanz“: Unter „Offene Beträge“ steht, was du schuldest und was dir geschuldet wird. Tippe auf einen Mitspieler: jedes Spiel und jede Wette zwischen euch, wie es stand, zusammen. „Bezahlt“, wenn du ihm gezahlt hast – er sieht es und bestätigt mit „Erhalten“; mit „Erhalten“ buchst du aus, was dir jemand gegeben hat. ↺ nimmt eine Zahlung zurück. Die Kacheln oben filtern: Tippe auf „Siege“, „Verlust“ oder „Wetten“ – dann stehen nur diese Spiele und Wetten da; ein Tipp öffnet sie, die Kachel noch einmal zeigt wieder alles.',
          ),
        video: 'balance',
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
        q: () => tr('What is "Press"?', 'Was ist „Press“?'),
        a: () =>
          tr(
            '"Press" is a row in the settings (like the house rules): tapped, switch on "Press (double the stake)" – whoever is last may double the stake during the game, 0,10 € becomes 0,20 €, then 0,40 € … up to the "Highest stake", as often as "Presses allowed" says; the row then reads "On · up to 1,60 €". In Nassau, "Auto press at 2 down" starts a new bet on its own once a side is two holes down.',
            '„Press“ ist eine Zeile in den Einstellungen (wie die Hausregeln): angetippt „Press (Einsatz verdoppeln)“ einschalten – dann darf der Letzte im Spiel den Einsatz verdoppeln, aus 0,10 € werden 0,20 €, dann 0,40 € … bis zum „Höchsteinsatz“, so oft wie bei „Erlaubte Pressen“ eingestellt; die Zeile zeigt dann „An · bis 1,60 €“. Bei Nassau startet „Auto-Press bei 2 hinten“ von selbst eine neue Wette, sobald eine Seite zwei Löcher hinten liegt.',
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
        // Sascha 08.11.2026, USA: a bet holds for one round – the standing in total and per round; the tournaments count
        q: () => tr('Where do I see what each of us did in one round – and do the tournaments count?', 'Wo sehe ich, was jeder in einer Runde geschafft hat – und zählen die Turniere?'),
        a: () =>
          tr(
            'Every bet holds for each round on its own and is settled after every round: made, the stake from each of the others – missed, nothing (or the stake to each, when the bet is "both ways"). In the pool, "Standing" shows "Total" – each cell the target in bold on top, below in how many rounds it was made, "2/5", green once made – and a chip per round (day and course): tapped, the target on top and below what each one did in that round (0 when nothing). On the round itself: menu → Leaderboard → tab "Bets" – the same standing, live. A tournament on the pool’s days counts for everyone who played in it – also the scores the host entered afterwards ("Enter scores" in the tournament), they count like a signed card. Where a phone has the round itself, its card counts with putts and greens; scores entered afterwards have strokes only. A tournament or a round of a series on a day of the pool: no own round from the pool – "To the tournament" at the bottom of the pool opens it in Rounds, "Take part"; it counts for the bets.',
            'Jede Wette gilt für jede Runde einzeln und wird nach jeder Runde abgerechnet: geschafft – der Einsatz von jedem anderen; nicht geschafft – nichts (bei „beidseitig“ der Einsatz an jeden). Im Pool zeigt „Stand“ „Gesamt“ – in jeder Zelle oben fett das Ziel, darunter, in wie vielen Runden es geschafft ist, „2/5“, grün sobald geschafft – und mit den Pfeilen daneben jede Runde (Tag und Platz; ein Tipp in die Mitte listet alle): oben das Ziel und darunter, was jeder in dieser Runde erreicht hat (0, wenn nichts). Auf der Runde selbst: Menü → Leaderboard → Reiter „Wetten“ – derselbe Stand, live. Ein Turnier in den Tagen des Pools zählt für jeden, der darin gespielt hat – auch die Scores, die der Host nachträglich eingetragen hat („Scores eintragen“ im Turnier), sie zählen wie eine unterschriebene Karte. Hat ein Handy die Runde selbst, zählt seine Karte mit Putts und Grüns; nachgetragene Scores haben nur Schläge. Ein Turnier oder eine Runde der Serie an einem Tag des Pools: keine eigene Runde aus dem Pool – „Zum Turnier“ unten im Pool öffnet es in Rounds, „Teilnehmen“; es zählt für die Wetten.',
          ),
        video: 'wagers',
      },
      {
        // Sascha 10.11.2026: "the app may set off – the way it calculated must be shown; set off or one by one as a setting";
        // 11.11.2026: set off only between the same two
        q: () => tr('How is the settlement worked out – and can each debt be paid on its own?', 'Wie wird abgerechnet – und kann man jede Schuld einzeln zahlen?'),
        a: () =>
          tr(
            'In the pool’s settings (pencil top right) "Abrechnung": "Verrechnet" – what two owe each other is set off, one payment between them: you owe Chris 20 $ for the 5+5+10, Chris owes you 20 $ for your birdies – all in all ±0, nobody pays. Nothing is passed on past a third: what you owe Erik you pay Erik. "Einzeln" – nothing set off, each pays what he owes, also when the other owes him something. "Rechenweg" in the settlement shows it per player: whom he owes what for which bet, what he gets back from the same one, and what he pays. Under each player’s bet the settlement says from whom it brought the money ("von Chris, Cedric – je 20 $"). Who paid taps "Bezahlt", who got it "Erhalten". In Bilanz a pool or game tapped in a player’s sheet opens it.',
            'In den Einstellungen des Pools (Stift oben rechts) „Abrechnung“: „Verrechnet“ – was sich zwei gegenseitig schulden, wird gegeneinander verrechnet, eine Zahlung zwischen den beiden: Du schuldest Chris 20 $ für das 5+5+10, Chris dir 20 $ für deine Birdies – unterm Strich ±0, keiner zahlt. Über einen Dritten wird nichts weitergereicht: Was du Erik schuldest, zahlst du Erik. „Einzeln“ – nichts verrechnet, jeder zahlt, was er schuldet, auch wenn der andere ihm etwas schuldet. „Rechenweg“ in der Abrechnung zeigt es je Spieler: wem er was für welche Wette schuldet, was er vom selben zurückbekommt und was er zahlt. Unter der Wette eines Spielers steht in der Abrechnung, von wem das Geld kommt („von Chris, Cedric – je 20 $“). Wer bezahlt hat, tippt „Bezahlt“, wer es bekommen hat, „Erhalten“. In der Bilanz öffnet ein Tipp auf einen Pool oder ein Spiel im Blatt eines Spielers genau diesen.',
          ),
        video: 'wagers',
      },
      {
        // Sascha 09.11.2026, USA: an invitation taken back, a pool that does not load
        q: () => tr('I invited someone by mistake – or his phone does not get into the pool. What now?', 'Ich habe jemanden versehentlich eingeladen – oder sein Handy kommt nicht in den Pool. Was tun?'),
        a: () =>
          tr(
            'The figure at each card says where he stands: the plain figure the host, with a tick on his phone, grey with an arrow invited but not accepted yet, red not invited. As the host, tap the invitation at his card ("Invited: …" or "Accepted: …"): "Take the invitation back" – or, once accepted, "Unlink" – his bets stay; then invite him anew. If his phone says the pool could not be loaded: he signs in (Profile → Sign in with Google) and opens it again – the app joins by the code on its own.',
            'Das Männchen an jeder Karte zeigt, wo er steht: schlicht der Host, mit Haken auf seinem Handy, grau mit Pfeil eingeladen, aber noch nicht angenommen, rot noch nicht eingeladen. Als Host tippst du bei seiner Karte auf die Einladung („Eingeladen: …“ oder „Angenommen: …“): „Einladung zurücknehmen“ – oder, schon angenommen, „Verknüpfung lösen“ – seine Wetten bleiben; danach lädst du ihn neu ein. Sagt sein Handy, der Pool lasse sich nicht laden: anmelden (Profil → Mit Google anmelden) und ihn noch einmal öffnen – die App tritt mit dem Code selbst bei.',
          ),
        video: 'wagers',
      },
      {
        // Sascha 09.11.2026, USA: 5+5+10 one against one, also across flights
        // 10.11.2026: against anyone – friends, players made, who keeps the score, the round of the day, net with its share
        q: () => tr('How do I play 5+5+10 – also against someone in another flight?', 'Wie spiele ich 5+5+10 – auch gegen jemanden aus einem anderen Flight?'),
        a: () =>
          tr(
            'Games → "New game" → game form 5+5+10 – or in Rounds: "Side bet" in the round’s setup, in a round (a tournament too) in the menu by the bag and the caddie – first the game form: 5+5+10, or Skins, Nassau, match play, Stableford duel, judged from your round’s strokes, their standing in the round’s leaderboard, tab "Bets". The day and its round (all rounds of the day, or the day’s tournament), "Opponents" – the pool’s players whatever their flight, the round’s players, your friends, or one added by name; several at once, one duel each –, "Who keeps the score" (you for both – from your round; one not in your flight counts with his own – or each his own), the stakes for front, back and the 18, gross or net with its share of the handicap (100 %, 75 % …) – "Challenge". A friend with the app hears of it and accepts or declines; a player without a phone counts at once. It goes into the pool of bets of the day – or, under "Pool", "Without a pool of bets": a 5+5+10 of its own, only these duels, settled on their own ("5+5+10 · 10.11."); the standing on top of the pool, the challenges below it. While playing, on the hole: the front nine and the back nine each on its own and the 18 ("Front 9 lost · Back 9: 1 up after 15 · 18: 2 down"), a tie wins nothing; it goes into the pool’s settlement. Who challenged changes it afterwards too – gross or net, the handicap share, the stakes, the day (tap it in the pool); against whom stays. The host changes everything. Played without setting it up? Add it afterwards: the same way, "Round of" the day played (back to the pool’s first day) – once the other accepts, the result comes from both cards of that day, into the settlement.',
            'Games → „Neues Spiel“ → Spielform 5+5+10 – oder in Rounds: „Sidebet“ in den Rundeneinstellungen, in der Runde (auch im Turnier) im Menü bei Bag und Caddie – zuerst die Spielform: 5+5+10, oder Skins, Nassau, Lochspiel, Stableford-Duell, gewertet aus den Schlägen deiner Runde, ihr Stand im Leaderboard der Runde, Reiter „Wetten“. Tag und Runde (alle Runden des Tages oder das Turnier des Tages), „Gegner“ – die Spieler des Pools, egal in welchem Flight, die Spieler deiner Runde, deine Freunde oder einer per Name angelegt; mehrere auf einmal, je ein Duell –, „Wer erfasst“ (ich für beide – aus deiner Runde; wer nicht in deinem Flight spielt, zählt mit seiner eigenen – oder jeder seinen), Einsätze für vorne, hinten und gesamt, brutto oder netto mit Anteil der Vorgabe (100 %, 75 % …) – „Herausfordern“. Ein Freund mit der App bekommt Bescheid und nimmt an oder lehnt ab; ein Spieler ohne Handy gilt sofort. Es landet im Wett-Pool des Tages – oder unter „Pool“ „Ohne Wett-Pool“: ein eigenes 5+5+10 nur für diese Duelle mit eigener Abrechnung („5+5+10 · 10.11.“); oben im Pool der Stand, darunter die Herausforderungen. Während der Runde auf dem Loch: Front 9 und Back 9 je für sich und die 18 („Front 9 verloren · Back 9: 1 vorn nach 15 · 18: 2 hinten“), Gleichstand gewinnt nichts; es fließt in die Abrechnung des Pools. Wer herausgefordert hat, ändert es auch nachträglich – brutto oder netto, die Vorgabe, die Einsätze, den Tag (im Pool antippen); der Gegner bleibt. Der Host ändert alles. Gespielt, aber nicht angelegt? Nachtragen: genauso, bei „Runde am“ den gespielten Tag wählen (bis zum ersten Tag des Pools zurück) – sobald der andere annimmt, kommt das Ergebnis aus euren Scorekarten des Tages und fließt in die Abrechnung.',
          ),
        video: 'wagers',
      },
      {
        // Sascha 01.11.2026: tournaments planned in Games, played in Rounds
        q: () => tr('Can I plan a tournament ahead – flights, markers, tee times?', 'Kann ich ein Turnier vorab planen – Flights, Zähler, Startzeiten?'),
        a: () =>
          tr(
            'Yes: Tournaments (on the start page) → "New tournament" – the name, the format as in Rounds (kind of round, mode – simple game, Better Ball, scramble, foursomes, greensome or Chapman, the teams formed in each flight: players 1 & 2 and 3 & 4 –, scoring and handicap allowance, net classes if you like), the course and the day, "Score entry", the players with their HCP, the special prizes, and last the flights. Under "Flights and tee times" you choose the draw – by hand, random, by handicap up or down –, the players per flight (2 to 4), the first tee time and the interval, from tee 1 or from tees 1 and 10. The app deals the flights and shows who marks whom; hold a player and drag him onto another flight – or tap him. Invite with the code or link: whoever has it is in. On the day the tournament shows in Rounds from 00:01 – "take part", pick yourself, play; the live leaderboard runs in Rounds and on the tournament\'s page, a player tapped shows his scorecard. Only whoever set it up changes or deletes it.',
            'Ja: Tournaments (auf der Startseite) → „Neues Turnier“ – Name, das Format wie in Rounds (Rundenart, Modus – Einfaches Spiel, Better Ball, Scramble, Vierer, Greensome oder Chapman, die Teams je Flight: Spieler 1 & 2 und 3 & 4 –, Scoring und HCP-Vorgabe, auf Wunsch Netto-Klassen), Platz und Tag, „Score-Erfassung“, die Spieler mit HCP, die Sonderwertungen und zum Schluss die Flights. Unter „Flights und Startzeiten“ wählst du die Einteilung – manuell, zufällig, nach HCP auf- oder absteigend –, die Spieler je Flight (2 bis 4), die erste Startzeit und den Abstand, von Tee 1 oder von Tee 1 und Tee 10. Die App teilt die Flights ein und zeigt, wer wen zählt; einen Spieler gedrückt halten und auf einen anderen Flight ziehen – oder antippen. Mit Code oder Link einladen: Wer ihn hat, ist dabei. Am Turniertag steht das Turnier ab 00:01 in Rounds – „teilnehmen“, sich wählen, spielen; das Live-Leaderboard läuft in Rounds und auf der Turnierseite, ein Tipp auf einen Spieler zeigt seine Scorekarte. Ändern oder löschen kann nur, wer es angelegt hat.',
          ),
        video: 'tours',
      },
      {
        // Sascha 04.11.2026: "a tournament over three rounds – the final day by result, as at the club championship"
        q: () => tr('A tournament over several days – with a cut and the final by result?', 'Ein Turnier über mehrere Tage – mit Cut und Finalrunde nach Ergebnis?'),
        a: () =>
          tr(
            '"New tournament" → "Rounds" – one to six, more under "Other number …" (up to 20). Each round gets its own row: its course and hole combination, its day and its flights, each with its own draw (e.g. days 1 and 2 by handicap down). The last round is dealt "By result": the worst first, the best in the final flight. Under "Cut" you choose after which round only the best play on ("Play on"). Once the rounds before are played, the tournament\'s page shows "Deal the flights by result" – one tap applies the cut and deals the final; the players see their tee times. The leaderboard adds up every round, one line a player as on the tour: place, total, the hole of the round being played ("F" = finished) and its score. A player tapped shows his rounds with the scorecard (switch rounds with the arrows); below the line those who missed the cut. A series of separate tournaments – each with its own players – is made under "Create a tournament series".',
            '„Neues Turnier“ → „Runden“ – eine bis sechs, mehr unter „Andere Anzahl …“ (bis 20). Jede Runde bekommt eine eigene Zeile: Platz und Lochkombination, Tag und Flights, jede mit eigener Einteilung (z. B. Tag 1 und 2 nach HCP absteigend). Die letzte Runde wird „Nach Ergebnis“ eingeteilt: die Schlechtesten zuerst, die Besten im Final-Flight. Unter „Cut“ wählst du, nach welcher Runde nur die Besten weiterspielen („Es spielen weiter“). Sind die Vorrunden gespielt, steht auf der Turnierseite „Flights nach Ergebnis einteilen“ – ein Tipp wendet den Cut an und teilt die Finalrunde ein; die Spieler sehen ihre Startzeiten. Das Leaderboard zählt alle Runden zusammen, je Spieler eine Zeile wie bei der Tour: Platz, Gesamt, Loch der laufenden Runde („F“ = fertig) und ihr Ergebnis. Ein Tipp auf den Spieler zeigt seine Runden mit Scorekarte (Runden mit den Pfeilen wechseln); unter der Linie stehen die, die den Cut verpasst haben. Eine Serie aus einzelnen Turnieren – jedes mit eigenen Spielern – stellst du unter „Turnierserie erstellen“ zusammen.',
          ),
        video: 'tourrounds',
      },
      {
        // Sascha 08.11.2026 (USA): "yesterday's tournament afterwards into the series – with its scores and the leaderboard"
        q: () => tr('Can a tournament already played join a series afterwards?', 'Kann ein schon gespieltes Turnier nachträglich in eine Serie?'),
        a: () =>
          tr(
            'Yes. Open the series (or the tournament over several rounds) – whoever set it up taps "Take in a tournament" ("Take in a tournament as a round") and picks it: played, today or planned. It stays as it is – code, flights, scores – and counts in the total from then on, by the players\' names (write them the same in both). A cut stays after the same round as set. For the bets: in the pool "Edit" → "From" on that day, then add the tournament (or the whole series) under "Rounds".',
            'Ja. Die Serie (oder das Turnier über mehrere Runden) öffnen – wer sie angelegt hat, tippt „Vorhandenes Turnier aufnehmen“ („Turnier als Runde aufnehmen“) und wählt es: gespielt, heute oder geplant. Es bleibt, wie es ist – Code, Flights, Scores – und zählt ab dann in der Gesamtwertung mit, über die Namen der Spieler (in beiden gleich schreiben). Ein Cut bleibt nach derselben Runde wie eingestellt. Für die Wetten: im Pool „Bearbeiten“ → „Von“ auf diesen Tag, dann unter „Runden“ das Turnier (oder die ganze Serie) hinzufügen.',
          ),
        video: 'tourrounds',
      },
      {
        // Sascha 09.11.2026 (USA): "the load time zero while it has not begun – live 30 minutes before the tee time"
        q: () => tr('When does the live leaderboard start?', 'Ab wann ist das Live-Leaderboard live?'),
        a: () =>
          tr(
            '30 minutes before the first tee time of the round – then it reads the scores every 30 seconds until every flight is in; the line under it says when it goes live. Before that it shows at once what your phone has (the players, the rounds played), also when you come back from a round of a series.',
            '30 Minuten vor der ersten Startzeit der Runde – dann liest es alle 30 Sekunden die Scores, bis alle Flights drin sind; die Zeile darunter sagt, ab wann es live ist. Davor zeigt es sofort, was dein Handy hat (die Spieler, die gespielten Runden), auch wenn du aus einer Runde der Serie zurückkommst.',
          ),
        video: 'tours',
      },
      {
        // Sascha 08.11.2026 (USA): "the live leaderboard for people outside – with the scorecards and the course"
        q: () => tr('Can friends at home follow the leaderboard?', 'Können Freunde zu Hause das Leaderboard verfolgen?'),
        a: () =>
          tr(
            'Yes – a tournament, a series, a game or a pool of bets: under "Spectators" switch on "Live leaderboard to watch" (in a tournament whoever set it up, in games and bets every player) and share the link. It opens in any browser, without the app and without an account: the leaderboard live every 20 seconds, a player tapped shows his scorecard, "Course" every hole on the aerial image with the scores on it. Joining is not possible with it. The money of a game or pool only shows when "Show amounts" is on. Switched off – or "New link" – the old link no longer opens.',
            'Ja – Turnier, Serie, Spiel oder Wett-Pool: unter „Zuschauer“ „Live-Leaderboard zum Zuschauen“ einschalten (im Turnier, wer es angelegt hat, in Games und Wetten jeder Spieler) und den Link teilen. Er öffnet in jedem Browser, ohne App und ohne Konto: das Leaderboard live alle 20 Sekunden, ein Spieler angetippt zeigt seine Scorekarte, „Platz“ jedes Loch im Luftbild mit den Scores daran. Mitspielen geht damit nicht. Das Geld eines Spiels oder Pools steht nur da, wenn „Beträge zeigen“ an ist. Ausgeschaltet – oder „Neuer Link“ – öffnet der alte Link nicht mehr.',
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
            'Link them: Friends → "My friend code" – let your friend scan the QR code ("Scan QR code" on his phone) or send him the invitation, e.g. by WhatsApp; he accepts – with your friends screen open you see it within seconds. Then name, handicap, home club and photo come from his profile, and you both see each other. The chain marks a linked friend, the pen one typed by hand – you can still add friends by hand. Far away? "Type code" takes the 6 digits under his QR code (123-456); where the camera shows no picture, "Take a photo of the code" reads it from a photo. To remove a friend, swipe him to the left – "Undo" brings him back. Linking needs an account (Google or user name).',
            'Verknüpfe sie: Freunde → „Mein Freundes-Code“ – dein Freund scannt den QR-Code („QR-Code scannen“ auf seinem Handy) oder du schickst ihm die Einladung, z. B. per WhatsApp; er nimmt an – hast du die Freunde-Seite offen, siehst du es in Sekunden. Dann kommen Name, HCP, Heimatclub und Bild aus seinem Profil, und ihr seht euch gegenseitig. Die Kette zeigt verknüpfte Freunde, der Stift von Hand angelegte – Freunde von Hand anlegen geht weiterhin. Weit weg? „Code eingeben“ nimmt die 6 Ziffern unter seinem QR-Code (123-456); zeigt die Kamera kein Bild, liest „Foto vom Code aufnehmen“ ihn aus einem Foto. Einen Freund entfernst du, indem du ihn nach links wischst – „Rückgängig“ holt ihn zurück. Zum Verknüpfen braucht es ein Konto (Google oder Benutzername).',
          ),
        video: 'profile',
      },
      {
        q: () => tr('Which notifications are there?', 'Welche Mitteilungen gibt es?'),
        a: () => tr('A round not checked yet, a tournament card to countersign or countersigned, games on several phones, a new bet with you, a bet made, the settlement when a pool is over (and a day later what is still to pay), your tee time about 45 minutes ahead, a tournament changed by the host, its result once every flight is in, a new best at Nearest to the Pin or Long Drive (its own switch), a thunderstorm on the course. Profile → Notifications.', 'Runde noch nicht geprüft, Turnierkarte gegenzeichnen oder gegengezeichnet, Spiele auf mehreren Handys, neue Wette mit dir, eine geschaffte Wette, die Abrechnung, wenn ein Pool vorbei ist (und einen Tag später, was noch offen ist), deine Startzeit etwa 45 Minuten vorher, Turnier vom Host geändert, der Endstand, sobald alle Flights im Ziel sind, ein neuer Bester bei Nearest to the Pin oder Long Drive (eigener Schalter), Gewitter auf dem Platz. Profil → Mitteilungen.'),
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
