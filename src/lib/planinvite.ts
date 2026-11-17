import { isSigned, letInvited, liveFlights, localDay, nameIs, rowMembers, withdrawInvite, type RoundEvent } from './sharedround';
import { loadFriends, type Friend } from './friends';
import { inviteFriend } from './push';
import { loadProfile, shownName } from './profile';
import { userId } from './sync';
import { tr } from './i18n';

// A planned tournament invites the linked friends in it by itself (Sascha 17.11.2026, "Automatisch einladen" – Thomas
// and Daniel were put into the Legends rounds of the series and heard nothing of it; Thomas's phone played a round of
// its own): every player of the plan who is a linked friend of the host gets the invitation in his inbox and a push –
// the same as "invite with a tap" (lib/push inviteFriend, the server lets him in) – and on its day "Turnier heute"
// on his start page. Once per tournament and friend (saved again: nobody asked twice); taken out of the plan before he
// answered: the invitation withdrawn. A typed name without the app: the host is told to send the code.

const plain = (s: string | undefined): string => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The names of a plan's players – a team's members one by one. */
export function planNames(ev: Pick<RoundEvent, 'flights'>): string[] {
  return liveFlights(ev as RoundEvent).flatMap((f) => f.players.flatMap((p) => (p.members?.length ? p.members.map((m) => m.name) : [p.name])));
}

/** The linked friend of a plan's name: his name or full name the same – else the one friend whose first name it is
 *  (two of that first name: none, nobody invited by guess). */
export function friendOf(name: string, friends: Friend[]): Friend | null {
  const linked = friends.filter((f) => !!f.uid);
  const exact = linked.filter((f) => plain(f.name) === plain(name) || (!!f.fullName && plain(f.fullName) === plain(name)));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  // a full name on both sides that differs is another person ("Thomas Schmidt" is not the friend "Thomas", Thomas Weber)
  const full = plain(name).includes(' ');
  const loose = linked.filter((f) => (full && plain(f.fullName).includes(' ') ? false : nameIs(name, f.name) || (!!f.fullName && nameIs(name, f.fullName))));
  return loose.length === 1 ? loose[0] : null;
}

/** Who the plan invites (linked friends, not the host) and who it leaves to the host (typed names). */
export function planGuests(ev: Pick<RoundEvent, 'flights'>, friends: Friend[], me: string | null): { linked: { uid: string; name: string }[]; typed: string[] } {
  const linked: { uid: string; name: string }[] = [];
  const typed: string[] = [];
  const host = plain(shownName(loadProfile()));
  for (const n of planNames(ev)) {
    const f = friendOf(n, friends);
    if (f?.uid) {
      if (f.uid !== me && !linked.some((x) => x.uid === f.uid)) linked.push({ uid: f.uid, name: n });
    } else if (plain(n) && plain(n) !== host && !nameIs(n, shownName(loadProfile()))) typed.push(n);
  }
  return { linked, typed };
}

// asked on this phone already – a plan saved twice in a moment (autosave) sends one push
const asked = new Set<string>();

/** After the host saved a planned tournament: its linked friends invited (inbox + push), the ones taken out of it since
 *  `before` withdrawn while unanswered. Quietly – a failure is tried again with the next save. */
export async function invitePlanned(code: string, ev: RoundEvent, before?: RoundEvent | null): Promise<{ invited: string[]; withdrawn: string[] }> {
  const out = { invited: [] as string[], withdrawn: [] as string[] };
  const me = userId();
  if (!me || ev.deletedAt) return out;
  const friends = loadFriends();
  // a round played already (Sascha 17.11.2026: Thomas and Daniel "auf jeden Fall nachträglich"): only who has his card
  // still to sign – to see it and sign; a day ahead or today: everyone
  const past = !!ev.date && ev.date < localDay();
  const signed = (name: string) => liveFlights(ev).some((f) => f.players.some((p) => (p.name === name || p.members?.some((m) => m.name === name)) && isSigned(f, p.id)));
  const inPlan = planGuests(ev, friends, me).linked;
  const now = inPlan.filter((f) => !past || !signed(f.name));
  const members = await rowMembers(code);
  if (members == null) return out;
  const who = shownName(loadProfile()) || tr('a player', 'ein Spieler');
  for (const f of now) {
    const key = `${code}:${f.uid}`;
    if (members.includes(f.uid) || asked.has(key)) continue;
    asked.add(key);
    let r = await inviteFriend(code, f.uid, f.name, who);
    if (r === 'old') r = (await letInvited(code, f.uid, f.name, who)) ? 'old' : null;
    if (r) out.invited.push(f.name);
    else asked.delete(key); // no connection: the next save tries again
  }
  if (before) {
    const gone = planGuests(before, friends, me).linked.filter((f) => !inPlan.some((x) => x.uid === f.uid) && members.includes(f.uid));
    for (const f of gone) {
      if (await withdrawInvite(code, f.uid)) {
        asked.delete(`${code}:${f.uid}`);
        out.withdrawn.push(f.name);
      }
    }
  }
  return out;
}
