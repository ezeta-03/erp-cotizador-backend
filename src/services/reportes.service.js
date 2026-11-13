// Reportes de Zaazmago: recaudado vs por cobrar, por mes, en soles.
//  - Facturado: total de las facturas y boletas emitidas en el mes (sin anuladas).
//  - Recaudado: cobros y detracciones recibidos en el mes (por la fecha del pago),
//    de cualquier documento de Zaazmago. Las retenciones no son dinero que entra.
//  - Por cobrar: saldo pendiente hoy (cliente + detracción) de lo emitido en el mes.
// Solo Zaazmago: los comprobantes de una cotización de marca Netwise se excluyen;
// los que no vienen de cotización (o son de marca Zaazmago) cuentan.
// Los montos en dólares se pasan a soles con el tipo de cambio del documento.
const prisma = require("../config/prisma");
const { resumenCobro, r2, hoyLima } = require("./cobros.service");
const { mesesEntre, MAXIMO_MESES } = require("./flujoEfectivo.service");

const inicioDia = (f) => new Date(`${f}T00:00:00-05:00`);
const finDia = (f) => new Date(`${f}T23:59:59.999-05:00`);
const SOLO_ZAAZMAGO = { OR: [{ cotizacionId: null }, { cotizacion: { marca: "ZAAZMAGO" } }] };
const TIPOS = ["FACTURA", "BOLETA"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const etiquetaMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

// Monto de un documento (en su moneda) pasado a soles.
const enSoles = (monto, c) => (c.moneda === "USD" ? r2(monto * (c.tipoCambio || 1)) : r2(monto));
const mesDe = (fecha) => fecha.toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);

async function recaudoVsCobrar(desde, hasta) {
  const meses = mesesEntre(desde, hasta);
  const rango = { gte: inicioDia(desde), lte: finDia(hasta) };

  const [comprobantes, pagos] = await Promise.all([
    prisma.comprobante.findMany({
      where: { tipo: { in: TIPOS }, estado: "ACEPTADO", fechaEmision: rango, ...SOLO_ZAAZMAGO },
      select: {
        id: true, moneda: true, tipoCambio: true, total: true, fechaEmision: true, estado: true, tipo: true,
        formaPago: true, cuotas: true, detraccionMonto: true, detraccionPorcentaje: true, agenteRetencion: true,
        pagos: { select: { tipo: true, monto: true, fecha: true }, orderBy: { fecha: "asc" } },
        notasCredito: { where: { estado: "ACEPTADO" }, select: { tipo: true, motivoCodigo: true, total: true } },
      },
    }),
    prisma.pagoComprobante.findMany({
      where: {
        fecha: rango,
        tipo: { in: ["COBRO", "DETRACCION"] },
        comprobante: { tipo: { in: TIPOS }, estado: "ACEPTADO", ...SOLO_ZAAZMAGO },
      },
      select: { tipo: true, fecha: true, monto: true, comprobante: { select: { moneda: true, tipoCambio: true } } },
    }),
  ]);

  const filas = new Map(meses.map((ym) => [ym, { clave: ym, etiqueta: etiquetaMes(ym), facturado: 0, recaudado: 0, porCobrar: 0 }]));

  // Facturado y por cobrar: según el mes de emisión.
  for (const c of comprobantes) {
    const fila = filas.get(mesDe(c.fechaEmision));
    if (!fila) continue;
    const cobro = resumenCobro(c, c.pagos, c.notasCredito);
    if (!cobro || cobro.estado === "ANULADO") continue;
    fila.facturado += enSoles(c.total, c);
    fila.porCobrar += enSoles(cobro.saldo, c) + cobro.saldoDetraccion;
  }

  // Recaudado: según el mes del pago. La detracción ya viene en soles.
  for (const p of pagos) {
    const fila = filas.get(mesDe(p.fecha));
    if (!fila) continue;
    fila.recaudado += p.tipo === "DETRACCION" ? p.monto : enSoles(p.monto, p.comprobante);
  }

  const lista = meses.map((ym) => {
    const f = filas.get(ym);
    return { clave: f.clave, etiqueta: f.etiqueta, facturado: r2(f.facturado), recaudado: r2(f.recaudado), porCobrar: r2(f.porCobrar) };
  });
  const suma = (k) => r2(lista.reduce((a, f) => a + f[k], 0));
  const facturado = suma("facturado");
  const porCobrar = suma("porCobrar");

  return {
    desde, hasta,
    corte: hoyLima(),
    meses: lista,
    totales: {
      facturado,
      recaudado: suma("recaudado"),
      porCobrar,
      cobradoDeLoFacturado: r2(facturado - porCobrar),
      porcentajeCobrado: facturado ? r2(((facturado - porCobrar) / facturado) * 100) : 0,
    },
  };
}

module.exports = { recaudoVsCobrar, MAXIMO_MESES };
