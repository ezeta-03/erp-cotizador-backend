// ZIP mínimo para un solo archivo: el PSE devuelve el XML firmado dentro de un
// ZIP (base64). Se lee por el directorio central porque algunos generadores
// dejan los tamaños en 0 en la cabecera local (bit 3 / data descriptor).
const zlib = require("zlib");

function unzipPrimerArchivo(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP inválido: no se encontró el directorio central");

  const cd = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(cd) !== 0x02014b50) throw new Error("ZIP inválido: directorio central corrupto");

  const metodo = buffer.readUInt16LE(cd + 10);
  const tamComprimido = buffer.readUInt32LE(cd + 20);
  const largoNombre = buffer.readUInt16LE(cd + 28);
  const offsetLocal = buffer.readUInt32LE(cd + 42);
  const nombre = buffer.toString("utf8", cd + 46, cd + 46 + largoNombre);

  const inicio = offsetLocal + 30 + buffer.readUInt16LE(offsetLocal + 26) + buffer.readUInt16LE(offsetLocal + 28);
  const datos = buffer.subarray(inicio, inicio + tamComprimido);

  if (metodo === 0) return { nombre, contenido: Buffer.from(datos) };
  if (metodo === 8) return { nombre, contenido: zlib.inflateRawSync(datos) };
  throw new Error(`ZIP con método de compresión no soportado: ${metodo}`);
}

function zipUnArchivo(nombre, contenido) {
  const nombreBuf = Buffer.from(nombre, "utf8");
  const datos = zlib.deflateRawSync(contenido);
  const crc = zlib.crc32(contenido);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(datos.length, 18);
  local.writeUInt32LE(contenido.length, 22);
  local.writeUInt16LE(nombreBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(datos.length, 20);
  central.writeUInt32LE(contenido.length, 24);
  central.writeUInt16LE(nombreBuf.length, 28);
  central.writeUInt32LE(0, 42);

  const offsetCentral = local.length + nombreBuf.length + datos.length;
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 8);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(central.length + nombreBuf.length, 12);
  fin.writeUInt32LE(offsetCentral, 16);

  return Buffer.concat([local, nombreBuf, datos, central, nombreBuf, fin]);
}

module.exports = { unzipPrimerArchivo, zipUnArchivo };
