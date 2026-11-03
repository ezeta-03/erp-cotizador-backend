const prisma = require("../config/prisma");
const XLSX = require("xlsx");
const { emisor } = require("../config/emisor");
const { numeroDocumento } = require("../services/sunat/ubl");
const { resumenCobro, r2, hoyLima } = require("../services/cobros.service");
const { cronograma, antiguedad, tramosVacios, sumarTramos, diasEntre, fechaLima, plazoDetraccion } = require("../services/antiguedad.service");
const { enviarRecordatorioCobro } = require("../services/correoComprobante.service");

// Cuentas por cobrar: facturas y boletas aceptadas (emitidas en el ERP o
// registradas desde el portal SOL) con su saldo, repartido por antigüedad.
const ABIERTOS = ["PENDIENTE", "PARCIAL", "VENCIDO"];
const TIPO_LABEL = { FACTURA: "Factura", BOLETA: "Boleta", NOTA_CREDITO: "Nota de crédito", NOTA_DEBITO: "Nota de débito" };
const MEDIO_LABEL = {
  TRANSFERENCIA: "transferencia", DEPOSITO: "depósito", EFECTIVO: "efectivo",
  YAPE_PLIN: "Yape/Plin", CHEQUE: "cheque", OTRO: "otro medio",
};

const SELECT_CARTERA = {
  id: true, tipo: true, serie: true, correlativo: true, fechaEmision: true, moneda: true, tipoCambio: true,
  clienteNumDoc: true, clienteNombre: true, clienteDireccion: true, clienteId: true,
  total: true, estado: true, formaPago: true, cuotas: true, origen: true,
  detraccionMonto: true, detraccionPorcentaje: true, agenteRetencion: true, recordatorioEnviadoAt: true,
  cliente: { select: { email: true } },
};

// Notas aceptadas de cada comprobante (la relación "NotaCredito" incluye también las de débito).
const NOTAS = {
  where: { estado: "ACEPTADO" },
  select: { id: true, tipo: true, serie: true, correlativo: true, fechaEmision: true, motivoCodigo: true, motivoDescripcion: true, total: true },
};

async function cargarComprobantes(where = {}) {
  return prisma.comprobante.findMany({
    where: { tipo: { in: ["FACTURA", "BOLETA"] }, estado: "ACEPTADO", ...where },
    select: {
      ...SELECT_CARTERA,
      pagos: { select: { id: true, tipo: true, monto: true, fecha: true, medio: true, numeroOperacion: true }, orderBy: { fecha: "asc" } },
      notasCredito: NOTAS,
    },
    orderBy: { fechaEmision: "asc" },
  });
}

// Comprobante con su cobro y antigüedad (null si no se cobra).
function enCartera(c, hoy) {
  const cobro = resumenCobro(c, c.pagos, c.notasCredito);
  if (!cobro) return null;
  const cuotas = cronograma({ formaPago: c.formaPago, cuotas: c.cuotas, fechaEmision: c.fechaEmision, monto: cobro.netoCliente });
  const abierto = ABIERTOS.includes(cobro.estado);
  const { tramos, vencimiento, diasVencido } = abierto ? antiguedad(cuotas, cobro.saldo, hoy) : { tramos: tramosVacios(), vencimiento: null, diasVencido: 0 };
  // Detracción que el cliente aún no deposita, con el plazo SUNAT.
  const fechaEmision = fechaLima(c.fechaEmision);
  const plazo = cobro.saldoDetraccion > 0 && cobro.estado !== "ANULADO" ? plazoDetraccion(fechaEmision) : null;
  const cobros = c.pagos.filter((p) => p.tipo === "COBRO");
  return {
    id: c.id, tipo: c.tipo, origen: c.origen, numero: numeroDocumento(c.serie, c.correlativo),
    fechaEmision, moneda: c.moneda, total: c.total, formaPago: c.formaPago,
    clienteId: c.clienteId, clienteNumDoc: c.clienteNumDoc, clienteNombre: c.clienteNombre, clienteEmail: c.cliente?.email || null,
    recordatorioEnviadoAt: c.recordatorioEnviadoAt,
    cobro, abierto, tramos, vencimiento, diasVencido,
    detraccion: plazo && { saldo: cobro.saldoDetraccion, plazo, dias: diasEntre(hoy, plazo) },
    ultimoCobro: cobros.length ? fechaLima(cobros[cobros.length - 1].fecha) : null,
  };
}

// Cartera completa: documentos abiertos, resumen por cliente y totales por moneda.
async function cartera() {
  const hoy = hoyLima();
  const documentos = (await cargarComprobantes()).map((c) => enCartera(c, hoy)).filter((d) => d?.abierto);

  const clientes = new Map();
  const totales = {};
  let detraccionPorCobrar = 0;
  for (const d of documentos) {
    const clave = `${d.clienteNumDoc}|${d.moneda}`;
    if (!clientes.has(clave)) {
      clientes.set(clave, {
        numDoc: d.clienteNumDoc, nombre: d.clienteNombre, email: d.clienteEmail, moneda: d.moneda,
        saldo: 0, documentos: 0, diasVencidoMax: 0, tramos: tramosVacios(), ultimoRecordatorio: null,
      });
    }
    const cl = clientes.get(clave);
    cl.saldo = r2(cl.saldo + d.cobro.saldo);
    cl.documentos++;
    cl.diasVencidoMax = Math.max(cl.diasVencidoMax, d.diasVencido);
    sumarTramos(cl.tramos, d.tramos);
    if (d.recordatorioEnviadoAt && (!cl.ultimoRecordatorio || d.recordatorioEnviadoAt > cl.ultimoRecordatorio)) {
      cl.ultimoRecordatorio = d.recordatorioEnviadoAt;
    }
    totales[d.moneda] ??= { saldo: 0, tramos: tramosVacios() };
    totales[d.moneda].saldo = r2(totales[d.moneda].saldo + d.cobro.saldo);
    sumarTramos(totales[d.moneda].tramos, d.tramos);
    detraccionPorCobrar = r2(detraccionPorCobrar + d.cobro.saldoDetraccion);
  }

  // Alertas: vencidos y lo que vence en los próximos 7 días.
  const porVencer = documentos.filter((d) => d.vencimiento && d.vencimiento >= hoy && diasEntre(hoy, d.vencimiento) <= 7);
  const vencidos = documentos.filter((d) => d.diasVencido > 0);
  const montoPorMoneda = (lista) => lista.reduce((a, d) => ({ ...a, [d.moneda]: r2((a[d.moneda] || 0) + d.cobro.saldo) }), {});

  return {
    hoy,
    documentos: documentos.sort((a, b) => b.diasVencido - a.diasVencido || (a.vencimiento || "").localeCompare(b.vencimiento || "")),
    clientes: [...clientes.values()].sort((a, b) => b.diasVencidoMax - a.diasVencidoMax || b.saldo - a.saldo),
    totales,
    detraccionPorCobrar,
    alertas: {
      vencidos: { cantidad: vencidos.length, montos: montoPorMoneda(vencidos) },
      porVencer: { cantidad: porVencer.length, montos: montoPorMoneda(porVencer) },
    },
  };
}

// GET / — cartera completa.
exports.resumen = async (req, res) => {
  try {
    res.json(await cartera());
  } catch (error) {
    console.error("❌ Error cargando cuentas por cobrar:", error);
    res.status(500).json({ message: "Error cargando cuentas por cobrar", error: error.message });
  }
};

// GET /alertas — para el panel: totales de vencidos/por vencer y los más atrasados.
exports.alertas = async (req, res) => {
  try {
    const { alertas, documentos, hoy } = await cartera();
    const urgentes = documentos
      .filter((d) => d.diasVencido > 0 || (d.vencimiento && diasEntre(hoy, d.vencimiento) <= 7))
      .slice(0, 8)
      .map(({ id, numero, clienteNombre, moneda, cobro, vencimiento, diasVencido }) => ({
        id, numero, clienteNombre, moneda, saldo: cobro.saldo, vencimiento, diasVencido,
      }));
    // Detracciones que los clientes no han depositado: las vencidas y las que vencen en 7 días.
    const detracciones = documentos
      .filter((d) => d.detraccion && d.detraccion.dias <= 7)
      .sort((a, b) => a.detraccion.dias - b.detraccion.dias)
      .map(({ id, numero, clienteNombre, detraccion }) => ({ id, numero, nombre: clienteNombre, ...detraccion }));
    res.json({ ...alertas, urgentes, detracciones });
  } catch (error) {
    console.error("❌ Error cargando alertas de cobro:", error);
    res.status(500).json({ message: "Error cargando alertas de cobro", error: error.message });
  }
};

/* =========================
   HISTORIAL: todos los comprobantes (también pagados y anulados)
   GET /historial?estado=PAGADO|POR_COBRAR|VENCIDO|DETRACCION|ANULADO&desde&hasta
========================= */
const FILTROS_HISTORIAL = {
  PAGADO: (d) => d.cobro.estado === "PAGADO",
  POR_COBRAR: (d) => d.abierto,
  VENCIDO: (d) => d.diasVencido > 0,
  DETRACCION: (d) => !!d.detraccion,
  ANULADO: (d) => d.cobro.estado === "ANULADO",
};

exports.historial = async (req, res) => {
  try {
    const { estado, desde, hasta } = req.query;
    const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
    const where = {};
    if (fecha(desde)) where.fechaEmision = { gte: new Date(`${desde}T00:00:00-05:00`) };
    if (fecha(hasta)) where.fechaEmision = { ...where.fechaEmision, lte: new Date(`${hasta}T23:59:59-05:00`) };
    const hoy = hoyLima();
    const filtro = FILTROS_HISTORIAL[estado] || (() => true);
    const documentos = (await cargarComprobantes(where))
      .map((c) => enCartera(c, hoy))
      .filter((d) => d && filtro(d))
      .sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision) || b.id - a.id)
      .slice(0, 500);
    res.json(documentos);
  } catch (error) {
    console.error("❌ Error cargando historial de cobros:", error);
    res.status(500).json({ message: "Error cargando historial de cobros", error: error.message });
  }
};

/* =========================
   ESTADO DE CUENTA DE UN CLIENTE
   GET /estado-cuenta/:numDoc?desde=aaaa-mm-dd&hasta=aaaa-mm-dd&formato=xlsx
   Cargos: comprobantes y notas de débito. Abonos: cobros, retenciones,
   detracciones depositadas (convertidas a la moneda del comprobante) y notas
   de crédito. Un bloque por moneda, con saldo anterior y saldo acumulado.
========================= */
function movimientosDe(c) {
  const numero = numeroDocumento(c.serie, c.correlativo);
  // La detracción se deposita en soles: en un comprobante en dólares se convierte a su moneda.
  const factorDetraccion = c.moneda === "PEN" || !c.detraccionMonto ? 1 : (c.total * c.detraccionPorcentaje / 100) / c.detraccionMonto;
  const movs = [{
    fecha: fechaLima(c.fechaEmision), documento: numero,
    concepto: `${TIPO_LABEL[c.tipo]}${c.origen === "EXTERNO" ? " (portal SOL)" : ""}${c.formaPago === "CREDITO" ? " — crédito" : ""}`,
    cargo: c.total, abono: 0,
  }];
  for (const n of c.notasCredito) {
    const esCredito = n.tipo === "NOTA_CREDITO";
    movs.push({
      fecha: fechaLima(n.fechaEmision), documento: numeroDocumento(n.serie, n.correlativo),
      concepto: `${TIPO_LABEL[n.tipo]} a ${numero}: ${n.motivoDescripcion || ""}`.trim(),
      cargo: esCredito ? 0 : n.total, abono: esCredito ? n.total : 0,
    });
  }
  for (const p of c.pagos) {
    const concepto = p.tipo === "DETRACCION" ? `Detracción depositada (S/ ${p.monto.toFixed(2)})`
      : p.tipo === "RETENCION" ? "Retención del cliente"
      : `Cobro por ${MEDIO_LABEL[p.medio] || p.medio}`;
    movs.push({
      fecha: fechaLima(p.fecha), documento: numero,
      concepto: `${concepto}${p.numeroOperacion ? ` — op. ${p.numeroOperacion}` : ""}`,
      cargo: 0, abono: r2(p.tipo === "DETRACCION" ? p.monto * factorDetraccion : p.monto),
    });
  }
  return movs;
}

async function estadoCuenta(numDoc, desde, hasta) {
  const hoy = hoyLima();
  const comprobantes = await cargarComprobantes({ clienteNumDoc: numDoc });
  if (comprobantes.length === 0) return null;

  const porMoneda = {};
  for (const c of comprobantes) (porMoneda[c.moneda] ??= []).push(...movimientosDe(c));

  const monedas = Object.entries(porMoneda).map(([moneda, movs]) => {
    movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.cargo - a.cargo);
    let saldo = 0;
    const movimientos = [];
    let saldoInicial = 0;
    for (const m of movs) {
      if (hasta && m.fecha > hasta) continue;
      saldo = r2(saldo + m.cargo - m.abono);
      if (desde && m.fecha < desde) { saldoInicial = saldo; continue; }
      movimientos.push({ ...m, saldo });
    }
    return { moneda, saldoInicial, movimientos, saldoFinal: saldo };
  });

  const ultimo = comprobantes[comprobantes.length - 1];
  return {
    emisor: { razonSocial: emisor.razonSocial, ruc: emisor.ruc },
    cliente: {
      numDoc, nombre: ultimo.clienteNombre, direccion: ultimo.clienteDireccion, email: ultimo.cliente?.email || null,
    },
    desde: desde || null, hasta: hasta || hoy, generado: hoy,
    monedas,
    pendientes: comprobantes.map((c) => enCartera(c, hoy)).filter((d) => d?.abierto),
  };
}

const fechaValida = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) ? String(f) : null);

exports.estadoCuenta = async (req, res) => {
  try {
    const desde = fechaValida(req.query.desde);
    const hasta = fechaValida(req.query.hasta);
    const datos = await estadoCuenta(String(req.params.numDoc), desde, hasta);
    if (!datos) return res.status(404).json({ message: "El cliente no tiene comprobantes aceptados" });
    if (req.query.formato !== "xlsx") return res.json(datos);

    const wb = XLSX.utils.book_new();
    for (const m of datos.monedas) {
      const filas = [
        [`Estado de cuenta — ${datos.cliente.nombre} (${datos.cliente.numDoc})`],
        [`${datos.emisor.razonSocial} — RUC ${datos.emisor.ruc}`],
        [`Periodo: ${datos.desde || "inicio"} al ${datos.hasta} — Moneda: ${m.moneda}`],
        [],
        ["Fecha", "Documento", "Concepto", "Cargo", "Abono", "Saldo"],
        ...(datos.desde ? [[datos.desde, "", "Saldo anterior", "", "", m.saldoInicial]] : []),
        ...m.movimientos.map((x) => [x.fecha, x.documento, x.concepto, x.cargo || "", x.abono || "", x.saldo]),
        [],
        ["", "", "Saldo final", "", "", m.saldoFinal],
      ];
      const ws = XLSX.utils.aoa_to_sheet(filas);
      ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 50 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, m.moneda === "USD" ? "Dólares" : "Soles");
    }
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=estado-cuenta-${datos.cliente.numDoc}.xlsx`,
    });
    res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (error) {
    console.error("❌ Error generando estado de cuenta:", error);
    res.status(500).json({ message: "Error generando estado de cuenta", error: error.message });
  }
};

/* =========================
   RECORDATORIO DE PAGO POR CORREO (lo decide quien cobra, no es automático)
   POST /clientes/:numDoc/recordatorio  body: { para? }
========================= */
exports.enviarRecordatorio = async (req, res) => {
  try {
    const hoy = hoyLima();
    const numDoc = String(req.params.numDoc);
    const abiertos = (await cargarComprobantes({ clienteNumDoc: numDoc }))
      .map((c) => enCartera(c, hoy))
      .filter((d) => d?.abierto && d.cobro.saldo > 0.009);
    if (abiertos.length === 0) return res.status(400).json({ message: "El cliente no tiene saldos pendientes" });

    const para = String(req.body.para || abiertos[0].clienteEmail || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    if (para.length === 0) return res.status(400).json({ message: "Indica el correo del cliente" });
    if (para.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return res.status(400).json({ message: "Hay un correo con formato inválido" });

    await enviarRecordatorioCobro({
      para,
      clienteNombre: abiertos[0].clienteNombre,
      emisor,
      cuenta: process.env.EMISOR_CUENTAS_COBRO || null,
      documentos: abiertos.map((d) => ({
        numero: d.numero, fechaEmision: d.fechaEmision, vencimiento: d.vencimiento,
        moneda: d.moneda, saldo: d.cobro.saldo, diasVencido: d.diasVencido,
      })),
    });
    await prisma.comprobante.updateMany({
      where: { id: { in: abiertos.map((d) => d.id) } },
      data: { recordatorioEnviadoAt: new Date() },
    });
    res.json({ enviadoA: para.join(", "), documentos: abiertos.length });
  } catch (error) {
    if (Number.isInteger(error.status) && error.status >= 400) return res.status(error.status).json({ message: error.message });
    console.error("❌ Error enviando recordatorio:", error);
    res.status(500).json({ message: "Error enviando recordatorio", error: error.message });
  }
};
