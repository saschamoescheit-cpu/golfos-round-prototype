import type { CategoryId, Video } from '../types';

// German explainer videos for the topics whose content files list mostly English ones (titles and channels
// checked with YouTube oEmbed, 16.10.2026). They are added after the category's own videos.

const v = (id: string, title: string, channel: string): Video => ({ id, title, channel, lang: 'de' });

export const VIDEOS_DE: Partial<Record<CategoryId, Video[]>> = {
  greenreading: [
    v('Khk7PGhDq1o', 'Golf Training Putt: So lesen Sie ein Break', 'Golf.de'),
    v('tV8RdAWzoLU', 'Golf Training Putten: Das Break richtig lesen', 'Golf.de'),
    v('Wjega5_5pPM', 'Grün lesen – immer auf der richtigen Seite der Fall-Linie', 'PGA Patrick Limbecker'),
    v('WmpC4D2i-dU', 'Grün lesen (Jonathan Taylor)', 'Golf for Us'),
    v('jGhWkR6mCCI', 'Grün lesen – das lernst du in einem AimPoint-Express-Kurs', 'Bausek Golf DE'),
  ],
  irons: [
    v('fIRndq3lXlk', 'Zuerst der Ball, dann der Boden', 'EINFACH BESSER GOLFEN'),
    v('yZzcE_VGaEc', 'Golf Training Eisen: Den Ball mittig treffen', 'Golf.de'),
    v('tpzWb5gFubs', 'Impact Tape: Ballkontakt mit dem Eisen verbessern', 'GOLFSTUN.DE'),
    v('Rn5QtoZZ7OU', 'Wie man Bodenkontakt vor dem Ball vermeidet', 'Florian Raggl Golf'),
  ],
  woods: [
    v('_hyThATVJNM', 'Fairwayholz vom Boden (mit Marcus Bruns)', 'GOLFSTUN.DE'),
    v('vwOL_czcTIs', 'Fairway-Holz vom Boden: Die richtige Ansprechposition', 'GOLFSTUN.DE'),
    v('UD_I1yYRj3w', 'Treffe das Holz 3 vom Fairway jedes Mal', 'Florian Raggl Golf'),
    v('RV7vHKR0q8k', 'Das Fairwayholz vom Boden spielen (Birdietrain)', 'Golf Post'),
    v('-WVSjEdBWq4', 'Fairwayholz vs. Hybrid – detaillierte Anleitung', 'Alexander Marx'),
  ],
  strategy: [
    v('0-ZY9--GywQ', 'Platzstrategie und Taktik beim Golf', 'GOLFSTUN.DE'),
    v('8K2TTIGOntE', 'Golf-Taktik: Den nächsten Schlag planen', 'GOLFSTUN.DE'),
    v('uJAKprMXcU4', 'Course-Management – Spielplan & Spieltaktik', 'PGA Patrick Limbecker'),
    v('rErHiKeE7xs', 'Viel besseres Course Management: größeres Ziel auf dem Golfplatz', 'Golfen mit Freude'),
  ],
  mental: [v('Nn8Ib5AawaE', 'Pre-Shot-Routine | Golf Mental', 'Antje Heimsoeth')],
  fitness: [
    v('y2smq_zwXdw', 'Aufwärmen vor der Golfrunde – Golf Fitness', 'Florian Raggl Golf'),
    v('m5YDinYhnp0', 'Golf Warm-Up: Brust und Schultern', 'GOLFSTUN.DE'),
    v('6E8pMeSsRjA', 'Hüftmuskulatur aufwärmen (Golf Warm-Up)', 'GOLFSTUN.DE'),
    v('-TEFEtvhdyw', '5 Übungen, die deinen Golfschwung beweglich halten', 'golfreich.fitness'),
  ],
  practice: [
    v('MJCG7gvGC0I', 'Effektiver trainieren auf der Driving Range', 'GOLFSTUN.DE'),
    v('lrNTmoQ3W6g', 'Effektives Einschlagen auf der Driving Range', 'GOLFSTUN.DE'),
    v('7Fzog82ca8Q', 'Golf Training Range: Die Richtung vorgeben', 'Golf.de'),
  ],
  ballflight: [
    v('_-6S0cf1my4', 'Stop den Hook … und Slice', 'EINFACH BESSER GOLFEN'),
    v('wklLR1o5xf0', 'Golf Training Schwung: Weg mit dem Slice!', 'Golf.de'),
    v('pj_sJOwQ3rM', 'Schwungbahn von außen vermeiden – besser von innen an den Ball kommen', 'GOLFSTUN.DE'),
    v('20bTUPC6--c', 'Nagel-Drill – Übung gegen Slices und Hooks', 'GOLFSTUN.DE'),
  ],
};
