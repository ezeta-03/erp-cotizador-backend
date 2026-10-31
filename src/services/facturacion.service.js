// Emisión de comprobantes electrónicos: numera, arma el XML UBL, lo firma y lo
// envía a SUNAT a través del PSE, y guarda el resultado en el comprobante.
const prisma = require("../config/prisma");
const { emisor } = require("../config/emisor");
const { generarXml, nombreArchivo } = require("./sunat/ubl");
const pse = require("./smartpse.client");

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Siguiente correlativo de la serie. El upsert con increment se ejecuta como
// un solo UPDATE ... RETURNING, así dos emisiones simultáneas no repiten número.
async function siguienteCorrelativo(tx, serie, tipo) {
  const s = await tx.serieComprobante.upsert({
    where: { serie },
    create: { serie, tipo, correlativo: 1 },
    update: { correlativo: { increment: 1 } },
  });
  return s.correlativo;
}

async function cargar(id) {
  return prisma.comprobante.findUnique({
    where: { id },
    include: { items: true, referencia: true },
  });
}

// Firma y envía un comprobante ya numerado. Nunca lanza por errores del PSE:
// los deja registrados en el comprobante (estado ERROR) para poder reintentar.
async function emitir(id) {
  const c = await cargar(id);
  const archivo = nombreArchivo(emisor.ruc, c.tipo, c.serie, c.correlativo);

  try {
    // Si ya se firmó en un intento anterior se reenvía el mismo XML: firmar
    // otra vez cambiaría el hash y la representación impresa ya emitida.
    // Excepción: si SUNAT respondió con una excepción (códigos 0100-1999, salvo
    // 1033) el comprobante no quedó registrado y se regenera con el XML actual.
    const codigo = Number(c.sunatCodigo);
    const excepcionSunat = c.estado === "ERROR" && codigo >= 100 && codigo < 2000 && codigo !== 1033;
    let { xmlFirmado, hash } = c;
    if (!xmlFirmado || excepcionSunat) {
      const firmado = await pse.firmar(archivo, generarXml(c, emisor));
      xmlFirmado = firmado.xmlFirmado;
      hash = firmado.hash;
      await prisma.comprobante.update({ where: { id }, data: { xmlFirmado, hash } });
    }

    const r = await pse.enviar(archivo, xmlFirmado);
    // 1033: SUNAT ya lo tenía registrado (un intento anterior sí llegó).
    const yaRegistrado = r.codigo === "1033";
    const estado = r.aceptado || yaRegistrado ? "ACEPTADO" : r.rechazado ? "RECHAZADO" : "ERROR";

    await prisma.comprobante.update({
      where: { id },
      data: {
        estado,
        sunatCodigo: r.codigo,
        sunatMensaje: r.mensaje || (r.ticket ? `Ticket ${r.ticket}` : null),
        ...(r.cdrXml && { cdrXml: r.cdrXml }),
      },
    });
  } catch (e) {
    console.error(`❌ Error emitiendo ${archivo}:`, e.message);
    await prisma.comprobante.update({
      where: { id },
      data: { estado: "ERROR", sunatMensaje: e.message.slice(0, 500) },
    });
  }

  return cargar(id);
}

module.exports = { emitir, siguienteCorrelativo, r2 };
