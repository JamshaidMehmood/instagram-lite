/**
 * Reads intrinsic image size straight from the file header.
 *
 * Two reasons this is done server-side rather than trusting a client-supplied
 * width/height:
 *
 * 1. The aspect ratio is stored on the post so the frontend can reserve the
 *    right box before the bytes arrive — that is what stops the feed jumping
 *    around as images load.
 * 2. It doubles as content sniffing. The declared `Content-Type` of an upload
 *    is attacker-controlled; if these parsers cannot make sense of the bytes,
 *    the file is not the image it claims to be and we reject it.
 *
 * Header parsing keeps the dependency list free of a native image library,
 * which matters for portable deploys.
 */
export interface ImageInfo {
  width: number;
  height: number;
  contentType: string;
}

function parsePng(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  // Bytes 12..15 must be the IHDR chunk type; width/height follow it.
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    contentType: 'image/png',
  };
}

function parseGif(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 10) return null;
  const header = buffer.subarray(0, 6).toString('ascii');
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;

  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    contentType: 'image/gif',
  };
}

function parseJpeg(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1; // resynchronise on padding between segments
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === undefined) return null;

    // SOFn carries the frame dimensions. 0xC4 (DHT), 0xC8 (JPG) and 0xCC
    // (DAC) share the range but are not frame headers.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        contentType: 'image/jpeg',
      };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null; // malformed; refuse rather than loop
    offset += 2 + segmentLength;
  }

  return null;
}

function parseWebp(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 30) return null;
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

  const format = buffer.subarray(12, 16).toString('ascii');
  const contentType = 'image/webp';

  if (format === 'VP8 ') {
    // Lossless-free simple format: 14-bit dimensions after the frame tag.
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      contentType,
    };
  }

  if (format === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      contentType,
    };
  }

  if (format === 'VP8X') {
    // Extended format stores dimensions minus one as 24-bit little-endian.
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
      contentType,
    };
  }

  return null;
}

const PARSERS = [parsePng, parseJpeg, parseWebp, parseGif] as const;

/** Returns null when the bytes are not a supported image. */
export function readImageInfo(buffer: Buffer): ImageInfo | null {
  for (const parse of PARSERS) {
    const info = parse(buffer);
    if (info && info.width > 0 && info.height > 0) return info;
  }
  return null;
}
