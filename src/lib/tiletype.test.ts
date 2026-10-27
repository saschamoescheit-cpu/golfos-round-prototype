import { describe, expect, it } from 'vitest';
import { pictureType } from './tiletype';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const xml = new TextEncoder().encode('<?xml version="1.0"?><ServiceException>Dataset not found</ServiceException>');

describe('what a tile really is', () => {
  it('an image type is a picture, whatever the bytes', () => {
    expect(pictureType('image/jpeg', new Uint8Array())).toBe('image/jpeg');
  });
  it('"application/octet-stream" (ArcGIS-hosted US services): a picture by its first bytes', () => {
    expect(pictureType('application/octet-stream', jpeg)).toBe('image/jpeg');
    expect(pictureType('binary/octet-stream', png.buffer)).toBe('image/png');
    expect(pictureType('application/octet-stream', webp)).toBe('image/webp');
    expect(pictureType('application/octet-stream', xml)).toBeNull();
  });
  it('an error page stays no picture, even with picture bytes behind a text type', () => {
    expect(pictureType('text/xml', xml)).toBeNull();
    expect(pictureType('text/html', jpeg)).toBeNull();
  });
  it('no type at all: the bytes decide', () => {
    expect(pictureType(null, jpeg)).toBe('image/jpeg');
    expect(pictureType('', xml)).toBeNull();
  });
});
