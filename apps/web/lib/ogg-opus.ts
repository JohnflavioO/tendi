/**
 * Converte áudio WebM/Opus (o que o MediaRecorder do Chrome/Edge grava) para OGG/Opus
 * (o formato das notas de voz do WhatsApp), SEM recodificar: só troca o "container".
 * Os pacotes Opus são copiados como estão.
 *
 * Referências: Matroska/EBML (leitura) e RFC 3533 + RFC 7845 (escrita OGG/Opus).
 */

// IDs dos elementos Matroska que interessam.
const ID = {
  Segment: 0x18538067,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Audio: 0xe1,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  BlockGroup: 0xa0,
  Block: 0xa1,
  SimpleBlock: 0xa3,
} as const;
// Elementos "container": entramos neles em vez de pular (isso também resolve tamanho desconhecido).
const CONTAINERS = new Set<number>([ID.Segment, ID.Tracks, ID.TrackEntry, ID.Audio, ID.Cluster, ID.BlockGroup]);

export class OggConversionError extends Error {}

type ParsedWebm = { packets: Uint8Array[]; channels: number; head: Uint8Array | null };

function readId(data: Uint8Array, pos: number): { id: number; length: number } | null {
  const first = data[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (length <= 4 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 4 || pos + length > data.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + data[pos + i]!;
  return { id, length };
}

/** Tamanho de elemento (varint). `unknown` quando todos os bits de valor são 1 (stream sem tamanho final). */
function readSize(data: Uint8Array, pos: number): { size: number; length: number; unknown: boolean } | null {
  const first = data[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || pos + length > data.length) return null;
  let value = first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    const byte = data[pos + i]!;
    if (byte !== 0xff) allOnes = false;
    value = value * 256 + byte;
  }
  return { size: value, length, unknown: allOnes };
}

function readBlockFrame(payload: Uint8Array): Uint8Array | null {
  // número da trilha (varint) + timecode (2 bytes) + flags (1 byte) + dados
  const track = readSize(payload, 0);
  if (!track) return null;
  const headerEnd = track.length + 3;
  if (payload.length <= headerEnd) return null;
  const lacing = (payload[track.length + 2]! >> 1) & 0x03;
  if (lacing !== 0) throw new OggConversionError('Áudio com "lacing" não é suportado.');
  return payload.subarray(headerEnd);
}

function parseWebm(data: Uint8Array): ParsedWebm {
  if (data.length < 32 || readId(data, 0)?.id !== 0x1a45dfa3) throw new OggConversionError('O arquivo não é um WebM válido.');
  const packets: Uint8Array[] = [];
  let channels = 1;
  let head: Uint8Array | null = null;
  let codec = '';
  let pos = 0;

  while (pos < data.length) {
    const idInfo = readId(data, pos);
    if (!idInfo) break;
    const sizeInfo = readSize(data, pos + idInfo.length);
    if (!sizeInfo) break;
    const bodyStart = pos + idInfo.length + sizeInfo.length;

    if (CONTAINERS.has(idInfo.id)) { pos = bodyStart; continue; } // entra no container
    const end = sizeInfo.unknown ? data.length : bodyStart + sizeInfo.size;
    if (end > data.length) {
      // Última peça cortada (gravação interrompida): usa o que existe só para blocos.
      if (idInfo.id === ID.SimpleBlock || idInfo.id === ID.Block) break;
      break;
    }
    const body = data.subarray(bodyStart, end);

    if (idInfo.id === ID.CodecID) codec = new TextDecoder().decode(body);
    else if (idInfo.id === ID.CodecPrivate && codec === 'A_OPUS') head = body.slice();
    else if (idInfo.id === ID.Channels && body.length === 1) channels = body[0]!;
    else if (idInfo.id === ID.SimpleBlock || idInfo.id === ID.Block) {
      const frame = readBlockFrame(body);
      if (frame && frame.length > 0) packets.push(frame.slice());
    }
    pos = end;
  }

  if (codec !== 'A_OPUS') throw new OggConversionError('O áudio gravado não está em Opus.');
  if (!packets.length) throw new OggConversionError('Não há áudio na gravação.');
  return { packets, channels, head };
}

/** Quantas amostras (a 48 kHz) um pacote Opus carrega, a partir do byte TOC (RFC 6716 §3.1). */
export function opusPacketSamples(packet: Uint8Array): number {
  const toc = packet[0];
  if (toc === undefined) return 0;
  const config = toc >> 3;
  let frameSize: number;
  if (config < 12) frameSize = [480, 960, 1920, 2880][config % 4]!; // SILK: 10/20/40/60 ms
  else if (config < 16) frameSize = config % 2 === 0 ? 480 : 960; // Hybrid: 10/20 ms
  else frameSize = [120, 240, 480, 960][config % 4]!; // CELT: 2,5/5/10/20 ms
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frames * frameSize;
}

// CRC do OGG: polinômio 0x04C11DB7, sem reflexão, valor inicial 0.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ bytes[i]!]!) >>> 0;
  return crc >>> 0;
}

function buildOpusHead(channels: number, preSkip: number): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode('OpusHead'), 0);
  head[8] = 1; // versão
  head[9] = channels;
  head[10] = preSkip & 0xff; head[11] = (preSkip >> 8) & 0xff;
  head[12] = 0x80; head[13] = 0xbb; // 48000 Hz (little-endian: 0x0000BB80)
  head[16] = 0; head[17] = 0; // ganho
  head[18] = 0; // mapeamento de canais (mono/estéreo)
  return head;
}

function buildOpusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('Tendi');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(new TextEncoder().encode('OpusTags'), 0);
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  return tags; // 0 comentários (últimos 4 bytes já são 0)
}

/** Monta uma página OGG com os pacotes dados (cada pacote termina dentro da própria página). */
function buildPage(opts: { type: number; granule: bigint; serial: number; sequence: number; packets: Uint8Array[] }): Uint8Array {
  const segments: number[] = [];
  for (const packet of opts.packets) {
    let remaining = packet.length;
    while (remaining >= 255) { segments.push(255); remaining -= 255; }
    segments.push(remaining);
  }
  if (segments.length > 255) throw new OggConversionError('Página OGG grande demais.');
  const payloadLength = opts.packets.reduce((sum, packet) => sum + packet.length, 0);
  const page = new Uint8Array(27 + segments.length + payloadLength);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0; // versão
  page[5] = opts.type;
  view.setBigUint64(6, opts.granule, true);
  view.setUint32(14, opts.serial >>> 0, true);
  view.setUint32(18, opts.sequence >>> 0, true);
  page[26] = segments.length;
  page.set(segments, 27);
  let offset = 27 + segments.length;
  for (const packet of opts.packets) { page.set(packet, offset); offset += packet.length; }
  view.setUint32(22, oggCrc(page), true); // checksum calculado com o campo zerado
  return page;
}

/** Converte WebM/Opus em OGG/Opus. Lança OggConversionError se não conseguir. */
export function webmOpusToOgg(webm: Uint8Array): Uint8Array {
  const { packets, channels, head } = parseWebm(webm);
  const hasHead = head && head.length >= 19 && new TextDecoder().decode(head.subarray(0, 8)) === 'OpusHead';
  const opusHead = hasHead ? head!.slice(0, head!.length) : buildOpusHead(channels, 312);
  const serial = (Math.random() * 0xffffffff) >>> 0;

  const pages: Uint8Array[] = [];
  let sequence = 0;
  pages.push(buildPage({ type: 0x02, granule: 0n, serial, sequence: sequence++, packets: [opusHead] })); // início do stream
  pages.push(buildPage({ type: 0x00, granule: 0n, serial, sequence: sequence++, packets: [buildOpusTags()] }));

  const PACKETS_PER_PAGE = 50; // ~1 s de áudio por página (20 ms por pacote)
  let granule = 0n;
  for (let i = 0; i < packets.length; i += PACKETS_PER_PAGE) {
    const group = packets.slice(i, i + PACKETS_PER_PAGE);
    for (const packet of group) granule += BigInt(opusPacketSamples(packet));
    const last = i + PACKETS_PER_PAGE >= packets.length;
    pages.push(buildPage({ type: last ? 0x04 : 0x00, granule, serial, sequence: sequence++, packets: group }));
  }

  const total = pages.reduce((sum, page) => sum + page.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const page of pages) { out.set(page, offset); offset += page.length; }
  return out;
}
