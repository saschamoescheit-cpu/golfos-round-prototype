import { describe, expect, it } from 'vitest';
import { getLang, useLangForTests } from '../lib/i18n';
import { COMMON_TEES, courseTees, defaultTee, profileTee, sortTees, STANDARD_TEES, teeId, teeName } from './tees';
import { geometryFromOsm, parseOsmXml } from '../lib/courses';

describe('the tees a course offers (Sascha 22.10.2026)', () => {
  it('a bundled course: the tees of its scorecard – numbers too', () => {
    expect(courseTees('sonantem:east').tees).toEqual(['62', '58', '52', '48']);
    expect(teeName('58')).toBe('Tee 58');
    // Hawks Landing (Orlando) has a silver tee – in German "Silber" (27./28.10.2026)
    const was = getLang();
    useLangForTests('de');
    expect(teeName('Silver')).toBe('Silber');
    useLangForTests('en');
    expect(teeName('Silver')).toBe('Silver');
    useLangForTests(was);
  });
  it('another course: the tees its map knows, longest first', () => {
    expect(courseTees('osm:way/1', ['Red', 'Yellow'])).toEqual({ tees: ['Yellow', 'Red'], known: true });
    expect(sortTees(['Green', 'Black', 'Red', 'White'])).toEqual(['Black', 'White', 'Red', 'Green']);
  });
  it('nothing known: the four nearly every course has – no black or green (only official tees)', () => {
    expect(courseTees('osm:way/1')).toEqual({ tees: COMMON_TEES, known: false });
    expect(COMMON_TEES).not.toContain('Black');
    expect(STANDARD_TEES).toContain('Green'); // the profile's choice keeps every colour
  });
  it('written in any way: "gelb", "Yellow", "Schwarz", "58"', () => {
    expect(['gelb', 'Yellow', ' YELLOW '].map(teeId)).toEqual(['Yellow', 'Yellow', 'Yellow']);
    expect(teeId('Schwarz')).toBe('Black');
    expect(teeId('58')).toBe('58');
    expect(teeId('championship')).toBeNull();
  });
  it('the start tee: yellow where there is one', () => {
    expect(defaultTee(['White', 'Yellow', 'Red'])).toBe('Yellow');
    expect(defaultTee(['62', '58', '52', '48'])).toBe('58');
  });
  it('OpenStreetMap: tee=yellow, tee=red on the tees (Frielinghausen)', () => {
    const xml = `<osm>
      <node id="1" lat="51.0" lon="7.0"/><node id="2" lat="51.0" lon="7.001"/><node id="3" lat="51.001" lon="7.001"/>
      <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="golf" v="tee"/><tag k="tee" v="red"/></way>
      <way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="golf" v="tee"/><tag k="tee" v="yellow"/></way>
      <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="golf" v="tee"/></way>
    </osm>`;
    expect(geometryFromOsm(parseOsmXml(xml)).teeColours).toEqual(['Yellow', 'Red']);
  });
});

// the trip to Florida (final list, Sascha 22.10.2026): tees and course ratings from the scorecards (GolfCourseAPI)
describe('Florida: the scorecards', () => {
  it("Falcon's Fire and Orange Lake Legends: their tees, longest first", () => {
    expect(courseTees('osm:way/311994625').tees).toEqual(['Gold', 'Blue', 'White', 'Red']);
    expect(courseTees('osm:relation/4039887').tees).toEqual(['Green', 'Black', 'Blue', 'White', 'Yellow']);
  });
});

// abroad the colours mean other lengths (night 22./23.10.2026): the standard tee "Yellow" by its length at home
describe('the standard tee in the USA', () => {
  it('Orange Lake (yellow = shortest) and Falcon\'s Fire: blue; Southern Dunes: white', () => {
    expect(profileTee(courseTees('osm:relation/4039887'), 'Yellow', 'osm:relation/4039887', true)).toBe('Blue');
    expect(profileTee(courseTees('osm:way/311994625'), 'Yellow', 'osm:way/311994625', true)).toBe('Blue');
    expect(profileTee(courseTees('southerndunes:fl'), 'Yellow', 'southerndunes:fl', true)).toBe('White');
  });
  it('at home the colour stays the colour', () => {
    expect(profileTee(courseTees('osm:relation/1326323'), 'Yellow', 'osm:relation/1326323', false)).toBe('Yellow');
  });
});
