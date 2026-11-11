// Libro Mayor simple (sin partida doble): movimientos y saldos de un periodo por
//  - cada cuenta de Caja y Bancos (en su moneda; saldo desde su saldo inicial),
//  - Ventas (facturas y boletas aceptadas, base sin IGV, menos notas de crédito),
//  - cada categoría de gasto (devengado: facturas de proveedores por fecha de
//    emisión, base sin IGV, y cuotas de alquiler de paneles por su vencimiento).
// Ventas y gastos van en soles (los documentos en dólares, con su tipo de
// cambio) y su saldo anterior es lo acumulado en el año hasta antes del periodo.
const prisma = require("../config/prisma");
const { r2 } = require("./cobros.service");
const { fechaLima } = require("./antiguedad.service");
const { numeroDocumento } = require("./sunat/ubl");
const { movimientosDe } = require("./cajaBancos.service");
const { etiquetaDocumento } = require("../utils/documentoPorPagar");
const { repartosPorProveedor, acumuladorLineas } = require("./lineasNegocio.service");

const TIPO_DOC_PROVEEDOR = {
  FACTURA: "Factura", RECIBO_HONORARIOS: "Recibo por honorarios", BOLETA: "Boleta", NOTA_DEBITO: "Nota de débito",
  NOTA_VENTA: "Nota de venta", OTRO: "Documento",
};
const TIPO_COMPROBANTE = { FACTURA: "Factura", BOLETA: "Boleta", NOTA_CREDITO: "Nota de crédito", NOTA_DEBITO: "Nota de débito" };
const GRUPOS = ["CAJA_BANCOS", "INGRESOS", "COSTO_VENTA", "GASTO_OPERATIVO"];

const inicioDia = (f) => new Date(`${f}T00:00:00-05:00`);
const finDia = (f) => new Date(`${f}T23:59:59.999-05:00`);
const enSoles = (moneda, monto, tipoCambio) => (moneda === "USD" ? r2(monto * (tipoCambio || 1)) : monto);

// Cierra una cuenta: separa lo anterior al periodo, calcula el saldo acumulado
// de cada movimiento y los totales. deudora: saldo = debe − haber; si no, haber − debe.
function cerrar(cuenta, movs, desde, saldoBase = 0) {
  const signo = cuenta.naturaleza === "DEUDORA" ? 1 : -1;
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.documento || "").localeCompare(b.documento || ""));
  let saldo = saldoBase;
  let saldoAnterior = saldoBase;
  let debe = 0;
  let haber = 0;
  const movimientos = [];
  for (const m of movs) {
    saldo = r2(saldo + signo * (m.debe - m.haber));
    if (m.fecha < desde) {
      saldoAnterior = saldo;
      continue;
    }
    debe = r2(debe + m.debe);
    haber = r2(haber + m.haber);
    movimientos.push({ ...m, saldo });
  }
  return { ...cuenta, saldoAnterior, debe, haber, saldoFinal: saldo, movimientos };
}

async function cajaBancos(desde, hasta) {
  const cuentas = await prisma.cuentaFinanciera.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  const resultado = [];
  for (const c of cuentas) {
    if (fechaLima(c.fechaSaldoInicial) > hasta) continue; // aún no existía en el periodo
    const movs = (await movimientosDe(c, { hasta })).map((m) => ({
      fecha: m.fecha, documento: m.concepto, concepto: [m.medio, m.numeroOperacion && `op. ${m.numeroOperacion}`].filter(Boolean).join(" · "),
      tercero: m.tercero, debe: m.ingreso, haber: m.egreso,
    }));
    const cuenta = cerrar(
      { clave: `CB-${c.id}`, nombre: c.nombre, grupo: "CAJA_BANCOS", naturaleza: "DEUDORA", moneda: c.moneda, activo: c.activo },
      movs, desde, c.saldoInicial,
    );
    if (c.activo || cuenta.movimientos.length || cuenta.saldoFinal) resultado.push(cuenta);
  }
  return resultado;
}

async function ventas(desde, hasta) {
  const comprobantes = await prisma.comprobante.findMany({
    where: { estado: "ACEPTADO", fechaEmision: { gte: inicioDia(`${desde.slice(0, 4)}-01-01`), lte: finDia(hasta) } },
    select: { tipo: true, serie: true, correlativo: true, fechaEmision: true, moneda: true, tipoCambio: true, valorVenta: true, clienteNombre: true, origen: true },
  });
  const movs = comprobantes.map((c) => {
    const base = enSoles(c.moneda, c.valorVenta, c.tipoCambio);
    const resta = c.tipo === "NOTA_CREDITO";
    return {
      fecha: fechaLima(c.fechaEmision), documento: numeroDocumento(c.serie, c.correlativo),
      concepto: `${TIPO_COMPROBANTE[c.tipo]}${c.origen === "EXTERNO" ? " (portal SOL)" : ""}${c.moneda === "USD" ? ` — US$ ${c.valorVenta.toFixed(2)} × ${c.tipoCambio}` : ""}`,
      tercero: c.clienteNombre, debe: resta ? base : 0, haber: resta ? 0 : base,
    };
  });
  const cuenta = cerrar({ clave: "VENTAS", nombre: "Ventas", grupo: "INGRESOS", naturaleza: "ACREEDORA", moneda: "PEN" }, movs, desde);
  return cuenta.movimientos.length || cuenta.saldoFinal ? [cuenta] : [];
}

// Gastos por categoría. Cada documento de proveedor va "conciliado" si tiene
// al menos un archivo adjunto (factura o foto); las cuotas de paneles no aplican.
// También reparte el gasto del periodo entre líneas de negocio (porLinea).
async function gastos(desde, hasta) {
  const rangoAnio = { gte: inicioDia(`${desde.slice(0, 4)}-01-01`), lte: finDia(hasta) };
  const [documentos, cuotas, categorias, repartos] = await Promise.all([
    prisma.cuentaPorPagar.findMany({
      where: { anulado: false, fechaEmision: rangoAnio },
      select: {
        id: true, tipoDocumento: true, serie: true, numero: true, numeroInterno: true, fechaEmision: true, moneda: true, tipoCambio: true,
        valorVenta: true, descripcion: true, deducible: true, categoriaGastoId: true, proveedorId: true,
        proveedor: { select: { razonSocial: true } }, _count: { select: { adjuntos: true } },
      },
    }),
    prisma.proveedorCuota.findMany({
      // Sin los de contratos suspendidos (como en Cuentas por pagar); estadoOverride null también cuenta.
      where: { fechaCobro: rangoAnio, proveedor: { OR: [{ estadoOverride: null }, { estadoOverride: { not: "SUSPENDIDO" } }] } },
      select: { numero: true, fechaCobro: true, monto: true, proveedor: { select: { nombre: true, razonSocial: true, ubicacion: true } } },
    }),
    prisma.categoriaGasto.findMany({ include: { padre: { select: { nombre: true } } }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] }),
    repartosPorProveedor(),
  ]);
  const lineas = acumuladorLineas(repartos);

  const porCategoria = new Map(); // id | "SIN" → movimientos
  const agregar = (id, mov) => {
    if (!porCategoria.has(id)) porCategoria.set(id, []);
    porCategoria.get(id).push(mov);
  };
  for (const d of documentos) {
    const fecha = fechaLima(d.fechaEmision);
    const monto = enSoles(d.moneda, d.valorVenta, d.tipoCambio);
    if (fecha >= desde) lineas.agregar(d.proveedorId, monto);
    agregar(d.categoriaGastoId ?? "SIN", {
      documentoId: d.id, conciliado: d._count.adjuntos > 0,
      fecha, documento: etiquetaDocumento(d),
      concepto: `${TIPO_DOC_PROVEEDOR[d.tipoDocumento] || "Documento"}${d.deducible ? "" : " (no deducible)"}${d.descripcion ? ` — ${d.descripcion}` : ""}${d.moneda === "USD" ? ` — US$ ${d.valorVenta.toFixed(2)} × ${d.tipoCambio}` : ""}`,
      tercero: d.proveedor.razonSocial, debe: monto, haber: 0,
    });
  }
  const alquiler = categorias.find((c) => !c.padreId && c.nombre === "Alquiler de paneles");
  for (const q of cuotas) {
    if (fechaLima(q.fechaCobro) >= desde) lineas.agregar(null, q.monto);
    agregar(alquiler?.id ?? "PANELES", {
      conciliado: null,
      fecha: fechaLima(q.fechaCobro), documento: `Cuota ${q.numero}`, concepto: `Alquiler de panel${q.proveedor.ubicacion ? ` — ${q.proveedor.ubicacion}` : ""}`,
      tercero: q.proveedor.razonSocial || q.proveedor.nombre, debe: q.monto, haber: 0,
    });
  }

  const resultado = [];
  for (const cat of categorias) {
    if (!porCategoria.has(cat.id)) continue;
    const grupo = cat.padreId ? categorias.find((p) => p.id === cat.padreId)?.grupo ?? cat.grupo : cat.grupo;
    resultado.push(cerrar(
      { clave: `CAT-${cat.id}`, nombre: cat.padre ? `${cat.padre.nombre} › ${cat.nombre}` : cat.nombre, grupo, naturaleza: "DEUDORA", moneda: "PEN" },
      porCategoria.get(cat.id), desde,
    ));
  }
  if (porCategoria.has("PANELES")) {
    resultado.push(cerrar({ clave: "CAT-PANELES", nombre: "Alquiler de paneles", grupo: "COSTO_VENTA", naturaleza: "DEUDORA", moneda: "PEN" }, porCategoria.get("PANELES"), desde));
  }
  if (porCategoria.has("SIN")) {
    resultado.push(cerrar({ clave: "CAT-SIN", nombre: "Sin categoría", grupo: "GASTO_OPERATIVO", naturaleza: "DEUDORA", moneda: "PEN" }, porCategoria.get("SIN"), desde));
  }
  const cuentas = resultado
    .filter((c) => c.movimientos.length || c.saldoFinal)
    .map((c) => ({ ...c, sinConciliar: c.movimientos.filter((m) => m.conciliado === false).length }));
  return { cuentas, porLinea: lineas.filas() };
}

// Mayor del periodo [desde, hasta] (aaaa-mm-dd): cuentas por grupo y totales en soles.
async function libroMayor(desde, hasta) {
  const [cb, ing, gas] = await Promise.all([cajaBancos(desde, hasta), ventas(desde, hasta), gastos(desde, hasta)]);
  const cuentas = [...cb, ...ing, ...gas.cuentas];
  const totales = Object.fromEntries(GRUPOS.filter((g) => g !== "CAJA_BANCOS").map((g) => {
    const del = cuentas.filter((c) => c.grupo === g);
    return [g, {
      saldoAnterior: r2(del.reduce((a, c) => a + c.saldoAnterior, 0)),
      periodo: r2(del.reduce((a, c) => a + (c.naturaleza === "DEUDORA" ? c.debe - c.haber : c.haber - c.debe), 0)),
      saldoFinal: r2(del.reduce((a, c) => a + c.saldoFinal, 0)),
    }];
  }));
  // Resultado del periodo: ventas − costo de venta − gasto operativo.
  const resultadoPeriodo = r2(totales.INGRESOS.periodo - totales.COSTO_VENTA.periodo - totales.GASTO_OPERATIVO.periodo);
  // Conciliación: documentos de proveedores del periodo con y sin comprobante adjunto.
  const docs = gas.cuentas.flatMap((c) => c.movimientos).filter((m) => m.conciliado !== null && m.conciliado !== undefined);
  const conciliacion = { conciliados: docs.filter((m) => m.conciliado).length, sinConciliar: docs.filter((m) => !m.conciliado).length };
  return { desde, hasta, cuentas, totales, resultadoPeriodo, conciliacion, porLinea: gas.porLinea };
}

module.exports = { libroMayor, GRUPOS };
