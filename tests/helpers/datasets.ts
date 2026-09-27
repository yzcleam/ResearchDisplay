import ExcelJS from 'exceljs';

export async function workbookBytes(
  rows: ExcelJS.CellValue[][],
  customize?: (workbook: ExcelJS.Workbook) => void,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('数据').addRows(rows);
  customize?.(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// A standards-conforming RAR 4 archive using the Store method, with real header/data CRCs.
// Keeping the fixture builder here avoids depending on a system RAR executable in CI.
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function rarBytes(files: { name: string; bytes: Buffer }[]) {
  const header = (type: number, flags: number, payload: Buffer) => {
    const bytes = Buffer.alloc(7 + payload.length);
    bytes[2] = type;
    bytes.writeUInt16LE(flags, 3);
    bytes.writeUInt16LE(bytes.length, 5);
    payload.copy(bytes, 7);
    bytes.writeUInt16LE(crc32(bytes.subarray(2)) & 0xffff);
    return bytes;
  };
  const parts: Buffer[] = [
    Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0]),
    header(0x73, 0, Buffer.alloc(6)),
  ];
  for (const file of files) {
    const name = Buffer.from(file.name);
    const payload = Buffer.alloc(25 + name.length);
    payload.writeUInt32LE(file.bytes.length, 0);
    payload.writeUInt32LE(file.bytes.length, 4);
    payload[8] = 2;
    payload.writeUInt32LE(crc32(file.bytes), 9);
    payload[17] = 20;
    payload[18] = 0x30;
    payload.writeUInt16LE(name.length, 19);
    payload.writeUInt32LE(0x20, 21);
    name.copy(payload, 25);
    parts.push(header(0x74, 0x8000, payload), file.bytes);
  }
  parts.push(header(0x7b, 0, Buffer.alloc(0)));
  return Buffer.concat(parts);
}
