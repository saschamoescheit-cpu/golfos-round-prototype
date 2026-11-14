import { answerJoin, inviteSeen, type JoinRequest, type RoundInvite } from './sharedround';
import { loadRounds } from './storage';
import { loadGames } from './gamestore';
import { loadPools, myAccount } from './wagerstore';
import { loadSeries, loadTours } from './tourstore';

/** Every round, game, pool of bets, tournament and series this phone has joined – an invitation to one of them is
 *  answered (Sascha 14.11.2026: Chris "hat die Nachrichten mehrmals angeklickt, aber diese gehen nicht weg" – the
 *  inbox knew only rounds and games, not the bets and the series he was in). */
export function joinedCodes(): string[] {
  const codes = [
    ...loadRounds().map((r) => r.shared?.code),
    ...loadGames().map((g) => g.shared?.code),
    // a pool of bets: in once a player of it is this account – invited, its pool is on the phone before (the server lets
    // every member read it)
    ...loadPools().filter((e) => { const me = myAccount(); return !!me && e.pool.players.some((p) => p.joined?.uid === me); }).map((e) => e.code),
    ...loadTours().map((e) => e.code),
    ...loadSeries().map((e) => e.code),
  ];
  return [...new Set(codes.filter((c): c is string => !!c))];
}

// what was swiped away or declined in the inbox (Sascha 14.11.2026: "Inbox Nachrichten auch löschbar, vllt mit links
// wischen") – on this phone; a new one with another key comes again
const DISMISSED = 'golfos.inbox.dismissed.v1';
export function inboxDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function dismissInbox(key: string): void {
  try {
    const all = [...inboxDismissed()].filter((k) => k !== key);
    localStorage.setItem(DISMISSED, JSON.stringify([...all, key].slice(-300)));
  } catch {
    /* storage full */
  }
  if (key.startsWith('inv:')) inviteSeen(key.slice(4));
  changed();
}

// What the inbox shows from the server, kept in one place (Sascha 13.11.2026: "alles in die Inbox"): the invitations
// to a round, a game or bets – looked up in the background (InboxWatch), no popup of their own any more – and the
// requests to join a round this phone hosts (JoinRequests looks them up; its notice on every screen stays – it is
// answered on the course, also from the hole map). The inbox redraws on "golfos:inbox".

export type JoinAsk = JoinRequest & { code: string };

let invites: RoundInvite[] = [];
let joins: JoinAsk[] = [];
const changed = () => window.dispatchEvent(new Event('golfos:inbox'));

export const inboxInvites = (): RoundInvite[] => invites;
export function setInboxInvites(v: RoundInvite[]): void {
  if (JSON.stringify(v) === JSON.stringify(invites)) return;
  invites = v;
  changed();
}
export const inboxJoins = (): JoinAsk[] => joins;
export function setInboxJoins(v: JoinAsk[]): void {
  if (JSON.stringify(v) === JSON.stringify(joins)) return;
  joins = v;
  changed();
}

/** Let in (or not) – the ones answered gone from the notice and the inbox; the host's flight adds who was let in. */
export async function answerJoins(some: JoinAsk[], yes: boolean): Promise<boolean> {
  const done = await Promise.all(some.map(async (a) => ((await answerJoin(a.code, a.id, yes)) ? a : null)));
  const ok = done.filter((a): a is JoinAsk => a != null);
  if (yes) for (const a of ok) window.dispatchEvent(new CustomEvent('golfos:join-approved', { detail: { code: a.code, name: a.name, hcp: a.hcp } }));
  setInboxJoins(joins.filter((y) => !ok.some((a) => a.code === y.code && a.id === y.id)));
  return ok.length === some.length;
}

// read and unread (Sascha 14.11.2026, mock-up A + E): what was in the open inbox counts as read once it is closed, a
// swipe right turns it back to unread (or read); the inbox's number counts only the unread – on this phone
const READ = 'golfos.inbox.read.v1';
export function inboxRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function markInboxRead(keys: string[], read = true): void {
  if (!keys.length) return;
  try {
    const all = [...inboxRead()].filter((k) => !keys.includes(k));
    localStorage.setItem(READ, JSON.stringify(read ? [...all, ...keys].slice(-300) : all));
  } catch {
    /* storage full */
  }
  changed();
}
