/**
 * A card's bytes -> its text: the specification's Encoding rules.
 *
 * A card is UTF-8. A leading byte-order mark is ignored, so byte 0 of the card
 * is the byte after it. A file with a card extension that is not UTF-8 is not
 * a card at all (HMD019) — not loaded, not a target — and is reported at
 * line 1, column 1 with the offset of the first byte that cannot be decoded.
 *
 * Browser-safe: `TextDecoder` and nothing else.
 */

const BOM = "\ufeff";

export type DecodedCard =
  | { ok: true; text: string }
  | { ok: false; message: string };

/**
 * The offset of the first byte that does not start a well-formed UTF-8
 * sequence, or -1 when every byte does.
 *
 * Well-formed is Unicode's Table 3-7: no overlong form, no surrogate, nothing
 * above U+10FFFF, no truncated sequence. The offset is where the ill-formed
 * sequence starts, which is the number Python's decoder reports as the
 * error's `start`, so the message names the same byte in both.
 */
export function firstInvalidByte(bytes: Uint8Array): number {
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    const b = bytes[i]!;
    if (b < 0x80) {
      i += 1;
      continue;
    }
    let need: number;
    let low = 0x80;
    let high = 0xbf;
    if (b >= 0xc2 && b <= 0xdf) need = 1;
    else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      if (b === 0xe0) low = 0xa0;
      else if (b === 0xed) high = 0x9f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      if (b === 0xf0) low = 0x90;
      else if (b === 0xf4) high = 0x8f;
    } else return i;
    for (let k = 1; k <= need; k += 1) {
      const c = bytes[i + k];
      if (c === undefined) return i;
      const lo = k === 1 ? low : 0x80;
      const hi = k === 1 ? high : 0xbf;
      if (c < lo || c > hi) return i;
    }
    i += need + 1;
  }
  return -1;
}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Decode a card's bytes, dropping a leading BOM; or say why it is not a card. */
export function decodeCard(bytes: Uint8Array): DecodedCard {
  const data =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  const bad = firstInvalidByte(data);
  if (bad !== -1) {
    return {
      ok: false,
      message: `not valid UTF-8 (byte ${bad} cannot be decoded), so it is not a card`,
    };
  }
  // Fatal as well: the scan above and the platform decoder must agree, and a
  // disagreement is a bug to surface rather than text to guess at.
  return { ok: true, text: decoder.decode(data) };
}

/** A card's text as a host already decoded it, a leading BOM dropped. */
export function cardText(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}
