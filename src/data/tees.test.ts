import { describe, expect, it } from 'vitest';
import { courseTees, defaultTee, sortTees, STANDARD_TEES, teeId, teeName } from './tees';
import { geometryFromOsm, parseOsmXml } from '../lib/courses';

describe('the tees a course offers (Sascha 22.10.2026)', () => {
  it('a bundled course: the tees of its scorecard – numbers too', () => {
    expect(courseTees('sonantem:east').tees).toEqual(['62', '58', '52', '48']);
    expect(teeName('58')).toBe('Tee 58');
  });
  it('another course: the tees its map knows, longest first', () => {
    expect(courseTees('osm:way/1', ['Red', 'Yellow'])).toEqual({ tees: ['Yellow', 'Red'], known: true });
    expect(sortTees(['Green', 'Black', 'Red', 'White'])).toEqual(['Black', 'White', 'Red', 'Green']);
  });
  it('nothing known: the usual colours with black and green', () => {
    expect(courseTees('osm:way/1')).toEqual({ tees: STANDARD_TEES, known: false });
    expect(STANDARD_TEES).toContain('Black');
    expect(STANDARD_TEES).toContain('Green');
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
