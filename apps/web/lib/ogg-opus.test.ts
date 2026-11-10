import { describe, expect, it } from 'vitest';
import { OggConversionError, oggCrc, opusPacketSamples, webmOpusToOgg } from './ogg-opus';

// 1 s de tom, mono, Opus em WebM "em stream" (Segment e Clusters de tamanho desconhecido, como o MediaRecorder do Chrome).
const FIXTURE_WEBM_B64 = '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';
const fixture = () => Uint8Array.from(atob(FIXTURE_WEBM_B64), c => c.charCodeAt(0));

type Page = { type: number; granule: bigint; serial: number; sequence: number; crcOk: boolean; packets: number; bytes: Uint8Array };
function parsePages(ogg: Uint8Array): Page[] {
  const pages: Page[] = [];
  let pos = 0;
  while (pos < ogg.length) {
    expect(String.fromCharCode(...ogg.subarray(pos, pos + 4))).toBe('OggS');
    const view = new DataView(ogg.buffer, ogg.byteOffset + pos);
    const nseg = ogg[pos + 26]!;
    const payload = ogg.subarray(pos + 27, pos + 27 + nseg).reduce((sum, n) => sum + n, 0);
    const size = 27 + nseg + payload;
    const page = ogg.slice(pos, pos + size);
    const stored = new DataView(page.buffer).getUint32(22, true);
    new DataView(page.buffer).setUint32(22, 0, true);
    pages.push({ type: ogg[pos + 5]!, granule: view.getBigUint64(6, true), serial: view.getUint32(14, true), sequence: view.getUint32(18, true), crcOk: oggCrc(page) === stored, packets: nseg, bytes: ogg.slice(pos, pos + size) });
    pos += size;
  }
  return pages;
}

describe('oggCrc', () => {
  it('bate com valores de referência calculados por uma implementação independente', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f);
    expect(oggCrc(new Uint8Array(0))).toBe(0);
    expect(oggCrc(new TextEncoder().encode('OggS'))).toBe(0x5fb0a94f);
  });
});

describe('opusPacketSamples', () => {
  it('lê a duração do pacote pelo byte TOC', () => {
    expect(opusPacketSamples(Uint8Array.of(0b00000000))).toBe(480); // SILK config 0: 10 ms
    expect(opusPacketSamples(Uint8Array.of(0b01001000))).toBe(960); // SILK config 9: 20 ms, 1 quadro (código 0)
    expect(opusPacketSamples(Uint8Array.of(0b00010000))).toBe(1920); // SILK config 2: 40 ms
    expect(opusPacketSamples(Uint8Array.of(0b00011000))).toBe(2880); // SILK config 3: 60 ms
    expect(opusPacketSamples(Uint8Array.of(0b01100000))).toBe(480); // Hybrid config 12: 10 ms
    expect(opusPacketSamples(Uint8Array.of(0b01101000))).toBe(960); // Hybrid config 13: 20 ms
    expect(opusPacketSamples(Uint8Array.of(0b10000000))).toBe(120); // CELT config 16: 2,5 ms
    expect(opusPacketSamples(Uint8Array.of(0b11111000))).toBe(960); // CELT 20 ms
    expect(opusPacketSamples(Uint8Array.of(0b11111001))).toBe(1920); // 2 quadros de 20 ms (código 1)
    expect(opusPacketSamples(Uint8Array.of(0b11111011, 3))).toBe(2880); // código 3, 3 quadros
    expect(opusPacketSamples(new Uint8Array(0))).toBe(0);
  });
});

describe('webmOpusToOgg', () => {
  const ogg = webmOpusToOgg(fixture());
  const pages = parsePages(ogg);

  it('gera um stream OGG/Opus válido: início, tags, áudio e fim', () => {
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[0]!.type).toBe(0x02); // início do stream
    expect(pages[pages.length - 1]!.type).toBe(0x04); // fim do stream
    expect(new TextDecoder().decode(pages[0]!.bytes.subarray(28, 36))).toBe('OpusHead');
    expect(new TextDecoder().decode(pages[1]!.bytes.subarray(28, 36))).toBe('OpusTags');
  });
  it('todas as páginas têm CRC correto, mesmo serial e sequência 0,1,2...', () => {
    expect(pages.every(page => page.crcOk)).toBe(true);
    expect(new Set(pages.map(page => page.serial)).size).toBe(1);
    expect(pages.map(page => page.sequence)).toEqual(pages.map((_, i) => i));
  });
  it('o cabeçalho Opus diz mono, 48 kHz', () => {
    const head = pages[0]!.bytes.subarray(28, 47);
    expect(head[8]).toBe(1); // versão
    expect(head[9]).toBe(1); // canais
    expect(new DataView(head.buffer, head.byteOffset).getUint32(12, true)).toBe(48000);
  });
  it('os granules só crescem e a duração fecha com ~1 s de áudio', () => {
    const granules = pages.map(page => Number(page.granule));
    expect(granules.slice(2).every((g, i, all) => i === 0 || g > all[i - 1]!)).toBe(true);
    const head = pages[0]!.bytes.subarray(28, 47);
    const preSkip = new DataView(head.buffer, head.byteOffset).getUint16(10, true);
    const seconds = (granules[granules.length - 1]! - preSkip) / 48000;
    expect(seconds).toBeGreaterThan(0.95);
    expect(seconds).toBeLessThan(1.1);
  });
  it('é determinístico no conteúdo de áudio (só o serial muda entre execuções)', () => {
    const again = parsePages(webmOpusToOgg(fixture()));
    expect(again.length).toBe(pages.length);
    expect(again.map(page => page.packets)).toEqual(pages.map(page => page.packets));
    expect(again.map(page => page.granule)).toEqual(pages.map(page => page.granule));
  });
  it('aproveita uma gravação cortada no meio', () => {
    const cut = fixture().subarray(0, 1500);
    const partial = parsePages(webmOpusToOgg(cut));
    expect(partial.every(page => page.crcOk)).toBe(true);
    expect(partial.length).toBeGreaterThanOrEqual(3);
  });
  it('recusa entradas que não são WebM/Opus', () => {
    expect(() => webmOpusToOgg(new Uint8Array(0))).toThrow(OggConversionError);
    expect(() => webmOpusToOgg(new Uint8Array(200).fill(7))).toThrow(OggConversionError);
    expect(() => webmOpusToOgg(ogg)).toThrow(OggConversionError); // um OGG não é WebM
  });
});
