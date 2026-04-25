import { randomBytes } from 'node:crypto';

const crcTable = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let current = index;
  for (let bit = 0; bit < 8; bit += 1) {
    current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  }
  crcTable[index] = current >>> 0;
}

function crc32Byte(crc: number, byte: number) {
  return (crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Byte(crc, byte);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function getDosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

class ZipCrypto {
  private key0 = 0x12345678;
  private key1 = 0x23456789;
  private key2 = 0x34567890;

  constructor(password: string) {
    for (const byte of Buffer.from(password, 'utf8')) {
      this.updateKeys(byte);
    }
  }

  encrypt(bytes: Uint8Array) {
    const encrypted = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      encrypted[index] = byte ^ this.decryptByte();
      this.updateKeys(byte);
    }

    return encrypted;
  }

  private decryptByte() {
    const temp = (this.key2 | 2) & 0xffff;
    return ((temp * (temp ^ 1)) >>> 8) & 0xff;
  }

  private updateKeys(byte: number) {
    this.key0 = crc32Byte(this.key0, byte);
    this.key1 = (Math.imul((this.key1 + (this.key0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    this.key2 = crc32Byte(this.key2, this.key1 >>> 24);
  }
}

export function createPasswordProtectedZip(input: {
  filename: string;
  contents: Uint8Array;
  password: string;
  modifiedAt?: Date;
}) {
  const filenameBytes = Buffer.from(input.filename, 'utf8');
  const modifiedAt = input.modifiedAt ?? new Date();
  const { dosDate, dosTime } = getDosDateTime(modifiedAt);
  const checksum = crc32(input.contents);
  const encryptionHeader = randomBytes(12);
  encryptionHeader[11] = (checksum >>> 24) & 0xff;

  const crypto = new ZipCrypto(input.password);
  const encryptedHeader = crypto.encrypt(encryptionHeader);
  const encryptedContents = crypto.encrypt(input.contents);
  const compressedSize = encryptedHeader.length + encryptedContents.length;
  const uncompressedSize = input.contents.length;
  const localHeaderOffset = 0;
  const localHeader: number[] = [];

  writeUint32(localHeader, 0x04034b50);
  writeUint16(localHeader, 20);
  writeUint16(localHeader, 0x0801);
  writeUint16(localHeader, 0);
  writeUint16(localHeader, dosTime);
  writeUint16(localHeader, dosDate);
  writeUint32(localHeader, checksum);
  writeUint32(localHeader, compressedSize);
  writeUint32(localHeader, uncompressedSize);
  writeUint16(localHeader, filenameBytes.length);
  writeUint16(localHeader, 0);

  const centralDirectoryOffset =
    localHeader.length + filenameBytes.length + encryptedHeader.length + encryptedContents.length;
  const centralDirectory: number[] = [];

  writeUint32(centralDirectory, 0x02014b50);
  writeUint16(centralDirectory, 20);
  writeUint16(centralDirectory, 20);
  writeUint16(centralDirectory, 0x0801);
  writeUint16(centralDirectory, 0);
  writeUint16(centralDirectory, dosTime);
  writeUint16(centralDirectory, dosDate);
  writeUint32(centralDirectory, checksum);
  writeUint32(centralDirectory, compressedSize);
  writeUint32(centralDirectory, uncompressedSize);
  writeUint16(centralDirectory, filenameBytes.length);
  writeUint16(centralDirectory, 0);
  writeUint16(centralDirectory, 0);
  writeUint16(centralDirectory, 0);
  writeUint16(centralDirectory, 0);
  writeUint32(centralDirectory, 0);
  writeUint32(centralDirectory, localHeaderOffset);

  const endOfCentralDirectory: number[] = [];
  writeUint32(endOfCentralDirectory, 0x06054b50);
  writeUint16(endOfCentralDirectory, 0);
  writeUint16(endOfCentralDirectory, 0);
  writeUint16(endOfCentralDirectory, 1);
  writeUint16(endOfCentralDirectory, 1);
  writeUint32(endOfCentralDirectory, centralDirectory.length + filenameBytes.length);
  writeUint32(endOfCentralDirectory, centralDirectoryOffset);
  writeUint16(endOfCentralDirectory, 0);

  return Buffer.concat([
    Buffer.from(localHeader),
    filenameBytes,
    encryptedHeader,
    encryptedContents,
    Buffer.from(centralDirectory),
    filenameBytes,
    Buffer.from(endOfCentralDirectory),
  ]);
}
