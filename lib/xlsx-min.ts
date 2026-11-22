import { inflateRawSync } from "zlib";

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const DESC_SIG = 0x08074b50;

/** 從 xlsx（zip）抽出檔名 → 內容。僅支援 store / deflate。 */
export function unzipXlsx(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = buf.readUInt32LE(i);
    if (sig === CENTRAL_SIG) break;
    if (sig !== LOCAL_SIG) break;
    const flags = buf.readUInt16LE(i + 6);
    const method = buf.readUInt16LE(i + 8);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    let compSize = buf.readUInt32LE(i + 18);
    const nameStart = i + 30;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    if (flags & 0x8 && compSize === 0) {
      compSize = findCompressedSize(buf, dataStart);
    }
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    let content: Buffer;
    if (method === 0) content = Buffer.from(compressed);
    else if (method === 8) content = inflateRawSync(compressed);
    else throw new Error(`xlsx 不支援的壓縮方式 ${method}`);
    out.set(name, content);
    i = dataStart + compSize;
    if (flags & 0x8) {
      if (i + 4 <= buf.length && buf.readUInt32LE(i) === DESC_SIG) i += 16;
      else i += 12;
    }
  }
  return out;
}

function findCompressedSize(buf: Buffer, dataStart: number): number {
  for (let j = dataStart; j + 4 <= buf.length; j++) {
    const s = buf.readUInt32LE(j);
    if (s === LOCAL_SIG || s === CENTRAL_SIG || s === DESC_SIG) {
      return j - dataStart;
    }
  }
  return buf.length - dataStart;
}

export interface XlsxCell {
  col: string;
  row: number;
  value: string;
}

/** 解析 worksheet XML 的儲存格（含 sharedStrings）。 */
export function parseSheetCells(
  sheetXml: string,
  sharedStrings: string[]
): XlsxCell[] {
  const cells: XlsxCell[] = [];
  const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheetXml))) {
    const col = m[1];
    const row = Number.parseInt(m[2], 10);
    const attrs = m[3];
    const inner = m[4];
    const v = inner.match(/<v>([^<]*)<\/v>/);
    if (!v) continue;
    const raw = v[1];
    const isShared = /\bt="s"/.test(attrs);
    const value = isShared ? sharedStrings[Number.parseInt(raw, 10)] ?? raw : raw;
    cells.push({ col, row, value });
  }
  return cells;
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si[\s\S]*?<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const texts = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
      decodeXml(t[1])
    );
    out.push(texts.join(""));
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Excel 序列日（1899-12-30 紀元）→ YYYY-MM-DD */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
