import { describe, expect, it } from 'vitest';
import { geometryFromOsm, ownHoles, parseOsmXml } from './courses';

// Two courses side by side (Legends and Kings Ridge, Clermont FL – USA trip 17.10.2026): the map area of one course
// holds the other's holes. A tiny OSM file: course A (relation 1, a square) with holes 1–2, course B with hole 1 east of it.
const node = (id: number, lon: number, lat: number) => `<node id="${id}" lat="${lat}" lon="${lon}"/>`;
const way = (id: number, nodes: number[], tags: Record<string, string>) =>
  `<way id="${id}">${nodes.map((n) => `<nd ref="${n}"/>`).join('')}${Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('')}</way>`;
const XML = `<osm>
${node(1, 0, 0)}${node(2, 0.01, 0)}${node(3, 0.01, 0.01)}${node(4, 0, 0.01)}
${node(11, 0.002, 0.002)}${node(12, 0.004, 0.004)}${node(13, 0.006, 0.006)}${node(14, 0.008, 0.008)}
${node(21, 0.02, 0.002)}${node(22, 0.022, 0.004)}
${way(100, [1, 2, 3, 4, 1], {})}
${way(201, [11, 12], { golf: 'hole', ref: '1', par: '4' })}
${way(202, [13, 14], { golf: 'hole', ref: '2', par: '3' })}
${way(301, [21, 22], { golf: 'hole', ref: '1', par: '5' })}
<relation id="1"><member type="way" ref="100" role="outer"/><tag k="type" v="multipolygon"/><tag k="leisure" v="golf_course"/><tag k="name" v="A"/></relation>
</osm>`;

describe('a course next to another one', () => {
  it("keeps only the holes inside the course's own outline", () => {
    const geo = geometryFromOsm(ownHoles(parseOsmXml(XML), 'osm:relation/1'));
    expect(geo.holes.map((h) => `${h.ref}/${h.par}`)).toEqual(['1/4', '2/3']);
  });
  it('keeps everything without the outline (another id, or no course polygon in the data)', () => {
    expect(geometryFromOsm(ownHoles(parseOsmXml(XML), 'osm:relation/99')).holes).toHaveLength(3);
    expect(geometryFromOsm(ownHoles(parseOsmXml(XML), 'bundled:x')).holes).toHaveLength(3);
  });
});
