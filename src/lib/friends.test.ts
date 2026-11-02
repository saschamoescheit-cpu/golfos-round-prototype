import { describe, expect, it } from 'vitest';
import { mergeCards, type Friend, type FriendCard } from './friends';
import { codeFromText, spacedCode } from './friendlinks';

const card = (user_id: string, first: string, hcp: string, more: Partial<FriendCard> = {}): FriendCard => ({ user_id, first_name: first, last_name: '', hcp_index: hcp, home_club: '', photo: null, ...more });
let n = 0;
const newId = () => `n${++n}`;

describe('linked friends (Sascha 02.11.2026: "the handicap from the friend\'s own profile")', () => {
  it('a card updates its friend – the handicap changed in his profile', () => {
    const list: Friend[] = [{ id: 'a', name: 'Chris', hcp: '18,0', uid: 'u1' }];
    const next = mergeCards(list, [card('u1', 'Chris', '16,2', { last_name: 'Weber', home_club: 'GC Hetzenhof', photo: 'data:x' })], newId);
    expect(next).toEqual([{ id: 'a', name: 'Chris', hcp: '16,2', uid: 'u1', fullName: 'Chris Weber', club: 'GC Hetzenhof', photo: 'data:x' }]);
  });
  it('the friend typed by hand with the same name becomes the linked one (no double)', () => {
    const list: Friend[] = [{ id: 'a', name: 'chris ', hcp: '20' }, { id: 'b', name: 'Ben', hcp: '12' }];
    const next = mergeCards(list, [card('u1', 'Chris', '16,2')], newId);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: 'a', name: 'Chris', hcp: '16,2', uid: 'u1' });
    expect(next[1]).toEqual({ id: 'b', name: 'Ben', hcp: '12' });
  });
  it('a new friend comes in; typed by hand ones stay as they are', () => {
    const next = mergeCards([{ id: 'b', name: 'Ben', hcp: '12' }], [card('u2', 'Anna', '5,4')], newId);
    expect(next.map((f) => [f.name, f.hcp, !!f.uid])).toEqual([
      ['Ben', '12', false],
      ['Anna', '5,4', true],
    ]);
  });
  it('removed on the other side: he stays, as typed by hand with his last values', () => {
    const next = mergeCards([{ id: 'a', name: 'Chris', hcp: '16,2', uid: 'u1', club: 'X', photo: 'p' }], [], newId);
    expect(next).toEqual([{ id: 'a', name: 'Chris', hcp: '16,2' }]);
  });
  it('the last name when no first name is set', () => {
    expect(mergeCards([], [card('u3', '', '9', { last_name: 'Meier' })], newId)[0]).toMatchObject({ name: 'Meier', fullName: 'Meier' });
  });
});

describe('friend codes from a scan or typed', () => {
  it('the website link, the app link, the code itself (spaced, small letters)', () => {
    expect(codeFromText('https://saschamoescheit-cpu.github.io/golfos-round-prototype/#friend=A1B2C3D4E5F6')).toBe('A1B2C3D4E5F6');
    expect(codeFromText('de.moescheit.golfos://friend/A1B2C3D4E5F6')).toBe('A1B2C3D4E5F6');
    expect(codeFromText(' a1b2 c3d4 e5f6 ')).toBe('A1B2C3D4E5F6');
    expect(codeFromText('A1B2-C3D4-E5F6')).toBe('A1B2C3D4E5F6');
  });
  it('anything else is no friend code – a round\'s link neither', () => {
    expect(codeFromText('https://example.com')).toBeNull();
    expect(codeFromText('https://saschamoescheit-cpu.github.io/golfos-round-prototype/#round=ABC123')).toBeNull();
    expect(codeFromText('hello')).toBeNull();
  });
  it('spaced in fours to read out', () => {
    expect(spacedCode('A1B2C3D4E5F6')).toBe('A1B2 C3D4 E5F6');
  });
});
