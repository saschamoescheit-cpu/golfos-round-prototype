// What a tile really is (night run 27./28.10.2026): eleven US aerial services (Ohio counties, Maui, MassGIS, Leon County,
// Solano, NOAA …, most of them hosted by ArcGIS) send their JPEGs and PNGs as "application/octet-stream". Since the tile
// check of 23.10. the app had thrown those away as "no picture" – the map showed Esri there instead of the state's
// aerial, and nothing of them went into the offline store. A tile counts as a picture by its type, or – for such a
// generic type – by its first bytes.

const MAGIC: [string, number[]][] = [
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
];

/** The picture type of a tile – its content type, or what its first bytes say; null = no picture. */
export function pictureType(type: string | null, data: ArrayBuffer | Uint8Array): string | null {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('image/')) return t;
  if (t && !/octet-stream/.test(t)) return null;
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  for (const [name, sig] of MAGIC) if (sig.every((x, k) => b[k] === x)) return name;
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
