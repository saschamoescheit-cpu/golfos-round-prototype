import { L, type Category } from '../types';

// The topics that are new as shots (Sascha 15.11.2026: "Hoher Schlag – flacher Schlag generell im Golf, Low Point
// Training, Lob Shot, Spinkontrolle"). Their shots are in shots-more.ts, their drills are the existing drills the
// shots use (they show in these topics too). Values are the common teaching standard – our pro checks them.

export const lob: Category = {
  id: 'lob',
  name: L('Lob shot', 'Lob Shot'),
  short: L('High and soft over a bunker or to a tight pin – and when not to play it.', 'Hoch und weich über einen Bunker oder zur nahen Fahne – und wann besser nicht.'),
  intro: L(
    'The lob lands softly and stops quickly – the shot for little green between you and the hole. It needs a good lie and a committed swing; from a bare or hard lie a lower shot is the safer choice.',
    'Der Lob landet weich und bleibt schnell liegen – der Schlag, wenn zwischen dir und der Fahne wenig Grün ist. Er braucht eine gute Lage und einen entschlossenen Schwung; von einer kahlen oder harten Lage ist ein flacherer Schlag die sicherere Wahl.',
  ),
  sections: [],
  videos: [
    { id: 'Z_ehT2nsZSk', title: 'Tiger Woods How to Hit a Flop Shot Over Trouble', channel: 'TaylorMade Golf', lang: 'en' },
    { id: 'MU71wiLkjMM', title: 'How Rory McIlroy hits a flop shot', channel: 'Golf Channel', lang: 'en' },
  ],
  see: ['pitching', 'spin', 'bunker'],
};

export const spin: Category = {
  id: 'spin',
  name: L('Spin control', 'Spinkontrolle'),
  short: L('Make the ball stop – or let it roll: what spin needs and how you dose it.', 'Den Ball stoppen – oder rollen lassen: was Spin braucht und wie du ihn dosierst.'),
  intro: L(
    'Spin decides what the ball does after it lands. More spin comes from a clean strike, a dry lie, clean grooves and speed through the ball; less spin from grass between face and ball or a softer, rounder stroke. Knowing both lets you choose.',
    'Spin entscheidet, was der Ball nach der Landung tut. Mehr Spin kommt von einem sauberen Treffer, einer trockenen Lage, sauberen Rillen und Tempo durch den Ball; weniger Spin von Gras zwischen Fläche und Ball oder einer weicheren, runderen Bewegung. Wer beides kennt, kann wählen.',
  ),
  sections: [],
  videos: [
    { id: '6LSrGBjAJyY', title: 'How to Hit the Low Spinning Pitch Shot', channel: 'Titleist', lang: 'en' },
    { id: 'x1SpqQE__Fg', title: 'Titleist Brand Ambassador Jordan Spieth – 50 Yard Low Check Spinner', channel: 'Titleist UK & Ireland', lang: 'en' },
  ],
  see: ['pitching', 'lob', 'lowpoint'],
};

export const highlow: Category = {
  id: 'highlow',
  name: L('High and low', 'Hoch & flach'),
  short: L('Change the height of any shot – with ball position, weight, hands and finish.', 'Die Höhe jedes Schlags verändern – mit Ballposition, Gewicht, Händen und Finish.'),
  intro: L(
    'Every club can fly higher or lower. The height comes from the loft at impact: ball forward, weight centred and a high finish add loft; ball back, weight and hands forward and a short finish take it away. Low for wind and under branches, high over trees and to soft greens.',
    'Jeder Schläger kann höher oder flacher fliegen. Die Höhe kommt vom Loft im Treffmoment: Ball vorn, Gewicht mittig und ein hohes Finish geben Loft dazu; Ball hinten, Gewicht und Hände vorn und ein kurzes Finish nehmen ihn weg. Flach für Wind und unter Ästen, hoch über Bäume und auf weiche Grüns.',
  ),
  sections: [],
  see: ['trouble', 'irons', 'ballflight'],
};

export const lowpoint: Category = {
  id: 'lowpoint',
  name: L('Low point', 'Low Point'),
  short: L('Where the club reaches the bottom of its arc – the key to clean contact.', 'Wo der Schläger den tiefsten Punkt seines Bogens erreicht – der Schlüssel zum sauberen Treffer.'),
  intro: L(
    'The club swings on an arc; its lowest point decides the contact. With irons and wedges it must be after the ball (ball first, then ground), in the bunker under the ball in the sand, with the driver before the ball so it is hit on the way up. Weight and hands forward move it forward – the most common fault is a low point behind the ball: fat and thin shots.',
    'Der Schläger schwingt auf einem Bogen; sein tiefster Punkt entscheidet über den Treffer. Bei Eisen und Wedges muss er nach dem Ball liegen (erst Ball, dann Boden), im Bunker unter dem Ball im Sand, beim Driver vor dem Ball, damit er aufwärts getroffen wird. Gewicht und Hände vorn schieben ihn nach vorn – der häufigste Fehler ist ein tiefster Punkt hinter dem Ball: fette und getoppte Schläge.',
  ),
  sections: [],
  see: ['irons', 'chipping', 'bunker'],
};
