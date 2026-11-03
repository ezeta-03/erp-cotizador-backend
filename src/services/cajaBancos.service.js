// Caja y Bancos: cuenta de cada cobro/pago y saldos de las cuentas.
// Saldo = saldoInicial (a fechaSaldoInicial) + cobros que entraron − pagos y
// cuotas de paneles que salieron desde esa fecha, en la moneda de la cuenta.
const prisma = require("../config/prisma");
const migo = require("./migo.client");
const { r2 } = require("./cobros.service");
const { fechaLima } = require("./antiguedad.service");
const { numeroDocumento } = require("./sunat/ubl");

const TIPOS_CUENTA = ["BANCO", "CAJA", "DETRACCIONES", "BILLETERA"];
const MONEDAS = ["PEN", "USD"];

const errorValidacion = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

// Cuenta de un cobro/pago y su monto en la moneda de la cuenta.
// monedaPago: moneda del monto (la detracción siempre es en soles).
// tipoCambio: el indicado o, si falta y las monedas difieren, venta SUNAT de la fecha.
async function resolverCuenta({ cuentaId, monedaPago, monto, fecha, tipoCambio }) {
  if (!cuentaId) throw errorValidacion("Elige la cuenta (banco o caja) del movimiento");
  const cuenta = await prisma.cuentaFinanciera.findUnique({ where: { id: Number(cuentaId) } });
  if (!cuenta) throw errorValidacion("Cuenta no encontrada");
  if (!cuenta.activo) throw errorValidacion(`La cuenta ${cuenta.nombre} está desactivada`);
  const corte = fechaLima(cuenta.fechaSaldoInicial);
  if (fecha < corte) {
    throw errorValidacion(`La fecha es anterior al saldo inicial de ${cuenta.nombre} (${corte.split("-").reverse().join("/")})`);
  }
  if (cuenta.moneda === monedaPago) return { cuentaFinancieraId: cuenta.id, montoCuenta: r2(monto), tipoCambioCuenta: null };

  const tc = Number(tipoCambio) > 0 ? Number(tipoCambio) : (await migo.tipoCambioVenta(fecha)).venta;
  if (!(tc > 0)) throw errorValidacion("Indica el tipo de cambio");
  const montoCuenta = cuenta.moneda === "PEN" ? r2(monto * tc) : r2(monto / tc);
  return { cuentaFinancieraId: cuenta.id, montoCuenta, tipoCambioCuenta: tc };
}

// Movimientos de una cuenta desde su fecha de corte (o desde 'desde' si es posterior).
async function movimientosDe(cuenta, { desde, hasta } = {}) {
  const corte = cuenta.fechaSaldoInicial;
  const rango = {
    gte: desde && new Date(`${desde}T00:00:00-05:00`) > corte ? new Date(`${desde}T00:00:00-05:00`) : corte,
    ...(hasta && { lte: new Date(`${hasta}T23:59:59-05:00`) }),
  };
  const [cobros, pagos, cuotas] = await Promise.all([
    prisma.pagoComprobante.findMany({
      where: { cuentaFinancieraId: cuenta.id, fecha: rango },
      select: {
        id: true, tipo: true, fecha: true, monto: true, montoCuenta: true, medio: true, numeroOperacion: true,
        comprobante: { select: { id: true, serie: true, correlativo: true, clienteNombre: true, moneda: true } },
      },
    }),
    prisma.pagoCuentaPorPagar.findMany({
      where: { cuentaFinancieraId: cuenta.id, fecha: rango },
      select: {
        id: true, tipo: true, fecha: true, monto: true, montoCuenta: true, medio: true, numeroOperacion: true,
        cuenta: { select: { id: true, serie: true, numero: true, moneda: true, proveedor: { select: { razonSocial: true } } } },
      },
    }),
    prisma.proveedorCuota.findMany({
      where: { cuentaFinancieraId: cuenta.id, estado: "CANCELADO", fechaPago: rango },
      select: {
        id: true, numero: true, fechaPago: true, monto: true, igv: true, montoCuenta: true, medioPago: true, numeroOperacion: true,
        proveedor: { select: { nombre: true, razonSocial: true } },
      },
    }),
  ]);
  return [
    ...cobros.map((p) => ({
      origen: "COBRO", id: p.id, fecha: fechaLima(p.fecha), ingreso: p.montoCuenta ?? p.monto, egreso: 0,
      concepto: `${p.tipo === "DETRACCION" ? "Detracción" : "Cobro"} ${numeroDocumento(p.comprobante.serie, p.comprobante.correlativo)}`,
      tercero: p.comprobante.clienteNombre, medio: p.medio, numeroOperacion: p.numeroOperacion, documentoId: p.comprobante.id,
    })),
    ...pagos.map((p) => ({
      origen: "PAGO", id: p.id, fecha: fechaLima(p.fecha), ingreso: 0, egreso: p.montoCuenta ?? p.monto,
      concepto: `${p.tipo === "DETRACCION" ? "Detracción" : "Pago"} ${p.cuenta.serie}-${p.cuenta.numero}`,
      tercero: p.cuenta.proveedor.razonSocial, medio: p.medio, numeroOperacion: p.numeroOperacion, documentoId: p.cuenta.id,
    })),
    ...cuotas.map((q) => ({
      origen: "CUOTA_PANEL", id: q.id, fecha: fechaLima(q.fechaPago), ingreso: 0, egreso: q.montoCuenta ?? r2(q.monto + q.igv),
      concepto: `Alquiler de panel — cuota ${q.numero}`,
      tercero: q.proveedor.razonSocial || q.proveedor.nombre, medio: q.medioPago, numeroOperacion: q.numeroOperacion, documentoId: null,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.origen.localeCompare(b.origen) || a.id - b.id);
}

// Saldo actual de una cuenta (también ingresos y egresos desde el corte).
async function saldoDe(cuenta) {
  const movs = await movimientosDe(cuenta);
  const ingresos = r2(movs.reduce((a, m) => a + m.ingreso, 0));
  const egresos = r2(movs.reduce((a, m) => a + m.egreso, 0));
  return { ingresos, egresos, saldo: r2(cuenta.saldoInicial + ingresos - egresos), movimientos: movs.length };
}

module.exports = { TIPOS_CUENTA, MONEDAS, resolverCuenta, movimientosDe, saldoDe };
