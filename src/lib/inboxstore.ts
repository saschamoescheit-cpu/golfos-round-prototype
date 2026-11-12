import { answerJoin, type JoinRequest, type RoundInvite } from './sharedround';

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
