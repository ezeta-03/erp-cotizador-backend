const prisma = require("../config/prisma");
const { IGV_RATE } = require("../config/negocio");
const migo = require("../services/migo.client");
const { r2, hoyLima, MEDIOS_PAGO, TOLERANCIA } = require("../services/cobros.service");
const { cronograma, antiguedad, tramosVacios, sumarTramos, diasEntre, fechaLima, plazoDetraccion } = require("../services/antiguedad.service");
const { leerCondicion } = require("../utils/condicionPago");
const { sincronizarEstadoContrato } = require("./proveedores.controller");
const almacenamiento = require("../services/almacenamiento.service");

// Cuentas por pagar: documentos de proveedores de compras (facturas, recibos
// por honorarios…) y las cuotas de alquiler de los arrendadores de paneles.
const TIPOS_DOCUMENTO = ["FACTURA", "RECIBO_HONORARIOS", "BOLETA", "NOTA_DEBITO", "OTRO"];
const CATEGORIAS = ["COMPRA", "SERVICIO", "GASTO_PROYECTO", "OTRO"];
const TIPOS_PAGO = ["PAGO", "DETRACCION"];
const MONEDAS = ["PEN", "USD"];
// Cuotas de paneles que entran a la cartera: vencidas o que vencen en estos días.
const HORIZONTE_CUOTAS_PANEL = 30;

class ErrorValidacion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

function responderError(res, error, contexto) {
  if (error instanceof ErrorValidacion || (Number.isInteger(error.status) && error.status < 600)) {
    return res.status(error.status || 400).json({ message: error.message });
  }
  if (error.code === "P2002") return res.status(409).json({ message: "Ya existe un registro con esos datos" });
  console.error(`❌ Error ${contexto}:`, error);
  res.status(500).json({ message: `Error ${contexto}`, error: error.message });
}

const texto = (v, max = 300) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const sumarDias = (fechaIso, dias) => {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const fechaDia = (f) => new Date(`${f}T12:00:00-05:00`);

/* =========================
   PROVEEDORES DE COMPRAS
========================= */
function datosProveedor(body, parcial = false) {
  const data = {};
  if (!parcial || body.ruc !== undefined) {
    const ruc = String(body.ruc || "").trim();
    if (!/^(\d{11}|\d{8})$/.test(ruc)) throw new ErrorValidacion("Ingresa un RUC de 11 dígitos (o DNI de 8)");
    data.ruc = ruc;
  }
  if (!parcial || body.razonSocial !== undefined) {
    const razonSocial = texto(body.razonSocial);
    if (!razonSocial) throw new ErrorValidacion("Falta la razón social");
    data.razonSocial = razonSocial;
  }
  for (const campo of ["nombreComercial", "direccion", "contacto", "telefono", "email", "banco", "numeroCuenta", "cci"]) {
    if (body[campo] !== undefined) data[campo] = texto(body[campo]);
  }
  if (body.activo !== undefined) data.activo = !!body.activo;
  return { ...data, ...leerCondicion(body) };
}

exports.listarProveedores = async (req, res) => {
  try {
    const buscar = String(req.query.buscar || "").trim();
    const proveedores = await prisma.proveedorCompra.findMany({
      where: {
        ...(req.query.todos !== "1" && { activo: true }),
        ...(buscar && {
          OR: [
            { razonSocial: { contains: buscar, mode: "insensitive" } },
            { nombreComercial: { contains: buscar, mode: "insensitive" } },
            { ruc: { contains: buscar } },
          ],
        }),
      },
      orderBy: { razonSocial: "asc" },
    });
    res.json(proveedores);
  } catch (error) {
    responderError(res, error, "listando proveedores");
  }
};

exports.crearProveedor = async (req, res) => {
  try {
    res.status(201).json(await prisma.proveedorCompra.create({ data: datosProveedor(req.body) }));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ message: "Ya hay un proveedor con ese RUC" });
    responderError(res, error, "creando proveedor");
  }
};

exports.actualizarProveedor = async (req, res) => {
  try {
    res.json(await prisma.proveedorCompra.update({
      where: { id: Number(req.params.id) },
      data: datosProveedor(req.body, true),
    }));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ message: "Ya hay un proveedor con ese RUC" });
    if (error.code === "P2025") return res.status(404).json({ message: "Proveedor no encontrado" });
    responderError(res, error, "actualizando proveedor");
  }
};

/* =========================
   DOCUMENTOS POR PAGAR
========================= */
const INCLUDE_CUENTA = {
  proveedor: { select: { id: true, ruc: true, razonSocial: true, nombreComercial: true, banco: true, numeroCuenta: true, cci: true } },
  proyecto: { select: { id: true, nombre: true } },
  ordenAlmacen: { select: { id: true, fecha: true, notas: true } },
  movimientoAlmacen: { select: { id: true, fecha: true, cantidad: true, item: { select: { codigo: true, nombre: true } } } },
  pagos: {
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
    include: { usuario: { select: { nombre: true } }, adjuntos: { select: { id: true, nombre: true, tipo: true, tamano: true }, orderBy: { id: "asc" } } },
  },
};

// La detracción se registra en soles; en un documento en dólares se convierte con su tipo de cambio.
const detraccionEnMoneda = (c) =>
  !c.detraccionMonto ? 0 : c.moneda === "PEN" ? c.detraccionMonto : r2(c.detraccionMonto / (c.tipoCambio || 1));

// Saldo de un documento: neto al proveedor (total − detracción − retención) menos lo pagado.
function resumenPago(c, hoy = hoyLima()) {
  const neto = r2(c.total - detraccionEnMoneda(c) - (c.retencionMonto || 0));
  const suma = (tipo) => r2(c.pagos.filter((p) => p.tipo === tipo).reduce((a, p) => a + p.monto, 0));
  const pagado = suma("PAGO");
  const detraccionPagada = suma("DETRACCION");
  const saldo = r2(Math.max(neto - pagado, 0));
  const saldoDetraccion = r2(Math.max((c.detraccionMonto || 0) - detraccionPagada, 0));
  const cuotas = cronograma({ formaPago: c.formaPago, cuotas: c.cuotas, fechaEmision: c.fechaEmision, monto: neto });
  const { tramos, vencimiento, diasVencido } = antiguedad(cuotas, saldo, hoy);

  let estado;
  if (c.anulado) estado = "ANULADO";
  else if (saldo <= TOLERANCIA && saldoDetraccion <= TOLERANCIA) estado = "PAGADO";
  else if (diasVencido > 0) estado = "VENCIDO";
  else if (pagado > 0 || detraccionPagada > 0) estado = "PARCIAL";
  else estado = "PENDIENTE";
  return { estado, neto, pagado, saldo, detraccionPagada, saldoDetraccion, vencimiento, diasVencido, tramos: c.anulado ? tramosVacios() : tramos };
}

const conResumen = (c, hoy) => ({ ...c, documento: `${c.serie}-${c.numero}`, pago: resumenPago(c, hoy) });

// Valida el body y devuelve los datos del documento (sin usuario).
async function prepararCuenta(body) {
  const proveedorId = Number(body.proveedorId);
  const proveedor = proveedorId ? await prisma.proveedorCompra.findUnique({ where: { id: proveedorId } }) : null;
  if (!proveedor) throw new ErrorValidacion("Elige el proveedor");

  const tipoDocumento = String(body.tipoDocumento || "FACTURA").toUpperCase();
  if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) throw new ErrorValidacion(`tipoDocumento debe ser uno de: ${TIPOS_DOCUMENTO.join(", ")}`);
  const serie = String(body.serie || "").trim().toUpperCase();
  const numero = String(body.numero || "").trim().replace(/^0+(?=\d)/, "");
  if (!/^[A-Z0-9]{1,4}$/.test(serie)) throw new ErrorValidacion("La serie debe tener de 1 a 4 caracteres (ej. F001, E001)");
  if (!/^[A-Z0-9-]{1,20}$/i.test(numero)) throw new ErrorValidacion("Indica el número del documento");

  const fecha = String(body.fechaEmision || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw new ErrorValidacion("Indica una fecha de emisión válida (no futura)");

  const moneda = String(body.moneda || "PEN").toUpperCase();
  if (!MONEDAS.includes(moneda)) throw new ErrorValidacion("moneda debe ser PEN o USD");
  const tipoCambio = moneda === "USD" ? Number(body.tipoCambio) || (await migo.tipoCambioVenta(fecha)).venta : null;

  const total = r2(Number(body.total));
  if (!(total > 0)) throw new ErrorValidacion("El total debe ser mayor a 0");
  // IGV: el indicado, 0 en recibos por honorarios, o el incluido en el total.
  const igv = body.igv !== undefined && body.igv !== "" ? r2(Number(body.igv))
    : tipoDocumento === "RECIBO_HONORARIOS" ? 0
    : r2(total - total / (1 + IGV_RATE));
  if (!(igv >= 0) || igv >= total) throw new ErrorValidacion("El IGV no es válido");

  const detraccionMonto = Number(body.detraccionMonto) > 0 ? r2(Number(body.detraccionMonto)) : null;
  const retencionMonto = Number(body.retencionMonto) > 0 ? r2(Number(body.retencionMonto)) : null;
  const neto = r2(total - (detraccionMonto ? (moneda === "PEN" ? detraccionMonto : r2(detraccionMonto / tipoCambio)) : 0) - (retencionMonto || 0));
  if (!(neto > 0)) throw new ErrorValidacion("La detracción y la retención no pueden igualar o superar el total");

  const categoria = String(body.categoria || "COMPRA").toUpperCase();
  if (!CATEGORIAS.includes(categoria)) throw new ErrorValidacion(`categoria debe ser una de: ${CATEGORIAS.join(", ")}`);

  // Crédito: cuotas explícitas, o una sola a N días (los del body o los del proveedor).
  const formaPago = String(body.formaPago || proveedor.condicionPago || "CONTADO").toUpperCase() === "CREDITO" ? "CREDITO" : "CONTADO";
  let cuotas = null;
  if (formaPago === "CREDITO") {
    const dias = Number(body.diasCredito) || proveedor.diasCredito || 30;
    const lista = Array.isArray(body.cuotas) && body.cuotas.length ? body.cuotas : [{ monto: neto, fechaVencimiento: sumarDias(fecha, dias) }];
    cuotas = lista.map((q, i) => {
      const monto = r2(Number(q.monto));
      const venc = String(q.fechaVencimiento || "").slice(0, 10);
      if (!(monto > 0)) throw new ErrorValidacion(`Cuota ${i + 1}: el monto debe ser mayor a 0`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(venc) || venc < fecha) throw new ErrorValidacion(`Cuota ${i + 1}: el vencimiento debe ser igual o posterior a la emisión`);
      return { monto, fechaVencimiento: venc };
    });
    const suma = r2(cuotas.reduce((a, q) => a + q.monto, 0));
    if (Math.abs(suma - neto) > TOLERANCIA) throw new ErrorValidacion(`Las cuotas suman ${suma.toFixed(2)} y deben sumar el neto a pagar ${neto.toFixed(2)}`);
  }

  // Vínculos opcionales: proyecto y entrada de almacén (orden o movimiento suelto).
  const proyectoId = body.proyectoId ? Number(body.proyectoId) : null;
  if (proyectoId && !(await prisma.proyecto.findUnique({ where: { id: proyectoId }, select: { id: true } }))) {
    throw new ErrorValidacion("Proyecto no encontrado");
  }
  const ordenAlmacenId = body.ordenAlmacenId ? Number(body.ordenAlmacenId) : null;
  if (ordenAlmacenId) {
    const orden = await prisma.ordenAlmacen.findUnique({ where: { id: ordenAlmacenId }, select: { tipo: true } });
    if (orden?.tipo !== "ENTRADA") throw new ErrorValidacion("La orden de almacén debe ser una entrada");
  }
  const movimientoAlmacenId = body.movimientoAlmacenId ? Number(body.movimientoAlmacenId) : null;
  if (movimientoAlmacenId) {
    const mov = await prisma.movimientoAlmacen.findUnique({ where: { id: movimientoAlmacenId }, select: { tipo: true } });
    if (mov?.tipo !== "ENTRADA") throw new ErrorValidacion("El movimiento de almacén debe ser una entrada");
  }

  return {
    proveedorId, tipoDocumento, serie, numero,
    fechaEmision: fechaDia(fecha), moneda, tipoCambio,
    valorVenta: r2(total - igv), igv, total, detraccionMonto, retencionMonto,
    categoria, descripcion: texto(body.descripcion, 500),
    formaPago, cuotas,
    proyectoId, ordenAlmacenId, movimientoAlmacenId,
  };
}

// GET /documentos?estado=ABIERTOS|PAGADOS|ANULADOS&proveedorId=&proyectoId=
exports.listarDocumentos = async (req, res) => {
  try {
    const hoy = hoyLima();
    const cuentas = await prisma.cuentaPorPagar.findMany({
      where: {
        ...(req.query.proveedorId && { proveedorId: Number(req.query.proveedorId) }),
        ...(req.query.proyectoId && { proyectoId: Number(req.query.proyectoId) }),
      },
      include: INCLUDE_CUENTA,
      orderBy: [{ fechaEmision: "desc" }, { id: "desc" }],
      take: 500,
    });
    const filtro = {
      ABIERTOS: (c) => ["PENDIENTE", "PARCIAL", "VENCIDO"].includes(c.pago.estado),
      PAGADOS: (c) => c.pago.estado === "PAGADO",
      ANULADOS: (c) => c.pago.estado === "ANULADO",
    }[req.query.estado] || (() => true);
    res.json(cuentas.map((c) => conResumen(c, hoy)).filter(filtro));
  } catch (error) {
    responderError(res, error, "listando cuentas por pagar");
  }
};

exports.crearDocumento = async (req, res) => {
  try {
    const datos = await prepararCuenta(req.body);
    const c = await prisma.cuentaPorPagar.create({ data: { ...datos, usuarioId: req.user.id }, include: INCLUDE_CUENTA });
    res.status(201).json(conResumen(c));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ message: "Ese documento del proveedor ya está registrado" });
    responderError(res, error, "registrando cuenta por pagar");
  }
};

// PUT /documentos/:id — con pagos registrados solo cambian la descripción, la categoría y los vínculos.
exports.actualizarDocumento = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.cuentaPorPagar.findUnique({ where: { id }, include: { _count: { select: { pagos: true } } } });
    if (!actual) throw new ErrorValidacion("Documento no encontrado", 404);
    if (actual.anulado) throw new ErrorValidacion("El documento está anulado");
    const datos = await prepararCuenta({
      ...actual,
      fechaEmision: fechaLima(actual.fechaEmision),
      ...req.body,
    });
    const data = actual._count.pagos > 0
      ? { descripcion: datos.descripcion, categoria: datos.categoria, proyectoId: datos.proyectoId, ordenAlmacenId: datos.ordenAlmacenId, movimientoAlmacenId: datos.movimientoAlmacenId }
      : datos;
    const c = await prisma.cuentaPorPagar.update({ where: { id }, data, include: INCLUDE_CUENTA });
    res.json(conResumen(c));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ message: "Ese documento del proveedor ya está registrado" });
    responderError(res, error, "actualizando cuenta por pagar");
  }
};

// POST /documentos/:id/anular — solo sin pagos (p. ej. registrado por error o anulado por el proveedor).
exports.anularDocumento = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await prisma.cuentaPorPagar.findUnique({ where: { id }, include: { _count: { select: { pagos: true } } } });
    if (!actual) throw new ErrorValidacion("Documento no encontrado", 404);
    if (actual._count.pagos > 0) throw new ErrorValidacion("Tiene pagos registrados: elimínalos primero");
    const c = await prisma.cuentaPorPagar.update({ where: { id }, data: { anulado: true }, include: INCLUDE_CUENTA });
    res.json(conResumen(c));
  } catch (error) {
    responderError(res, error, "anulando cuenta por pagar");
  }
};

/* =========================
   PAGOS DE UN DOCUMENTO
========================= */
async function cargarCuenta(id) {
  const c = await prisma.cuentaPorPagar.findUnique({ where: { id }, include: INCLUDE_CUENTA });
  if (!c) throw new ErrorValidacion("Documento no encontrado", 404);
  return conResumen(c);
}

exports.obtenerDocumento = async (req, res) => {
  try {
    res.json(await cargarCuenta(Number(req.params.id)));
  } catch (error) {
    responderError(res, error, "obteniendo cuenta por pagar");
  }
};

// body: { tipo: "PAGO"|"DETRACCION", fecha, monto, medio, numeroOperacion?, nota? }
exports.registrarPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await cargarCuenta(id);
    if (c.pago.estado === "ANULADO") throw new ErrorValidacion("El documento está anulado");

    const tipo = req.body.tipo || "PAGO";
    const monto = r2(Number(req.body.monto));
    const fecha = String(req.body.fecha || "").slice(0, 10);
    const medio = req.body.medio;
    if (!TIPOS_PAGO.includes(tipo)) throw new ErrorValidacion(`tipo debe ser uno de: ${TIPOS_PAGO.join(", ")}`);
    if (!MEDIOS_PAGO.includes(medio)) throw new ErrorValidacion(`medio debe ser uno de: ${MEDIOS_PAGO.join(", ")}`);
    if (!(monto > 0)) throw new ErrorValidacion("El monto debe ser mayor a 0");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw new ErrorValidacion("Indica una fecha de pago válida (no futura)");
    const pendiente = tipo === "DETRACCION" ? c.pago.saldoDetraccion : c.pago.saldo;
    if (monto > pendiente + TOLERANCIA) {
      throw new ErrorValidacion(`El monto supera lo pendiente${tipo === "DETRACCION" ? " de detracción (S/)" : ""}: ${pendiente.toFixed(2)}`);
    }

    // Constancia opcional: se sube antes y, si el pago no se guarda, se borra del bucket.
    const adjunto = req.file ? await almacenamiento.subir(`pagos/${id}`, req.file) : null;
    try {
      await prisma.pagoCuentaPorPagar.create({
        data: {
          cuentaId: id, tipo, monto, medio, fecha: fechaDia(fecha),
          numeroOperacion: texto(req.body.numeroOperacion, 60),
          nota: texto(req.body.nota),
          usuarioId: req.user.id,
          ...(adjunto && { adjuntos: { create: { ...adjunto, usuarioId: req.user.id } } }),
        },
      });
    } catch (error) {
      if (adjunto) await almacenamiento.borrar([adjunto.ruta]);
      throw error;
    }
    res.status(201).json(await cargarCuenta(id));
  } catch (error) {
    responderError(res, error, "registrando pago");
  }
};

exports.eliminarPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const where = { id: Number(req.params.pagoId), cuentaId: id };
    const adjuntos = await prisma.adjuntoPago.findMany({ where: { pagoCuentaPorPagar: where }, select: { ruta: true } });
    const { count } = await prisma.pagoCuentaPorPagar.deleteMany({ where });
    if (count === 0) throw new ErrorValidacion("Pago no encontrado", 404);
    await almacenamiento.borrar(adjuntos.map((a) => a.ruta));
    res.json(await cargarCuenta(id));
  } catch (error) {
    responderError(res, error, "eliminando pago");
  }
};

// Adjunto de un pago de este documento (o null).
const buscarAdjunto = (req) => prisma.adjuntoPago.findFirst({
  where: { id: Number(req.params.adjuntoId), pagoCuentaPorPagar: { id: Number(req.params.pagoId), cuentaId: Number(req.params.id) } },
});

// POST /documentos/:id/pagos/:pagoId/adjuntos (multipart "archivo")
exports.agregarAdjuntoPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pagoId = Number(req.params.pagoId);
    if (!req.file) throw new ErrorValidacion("Adjunta una imagen o PDF");
    const pago = await prisma.pagoCuentaPorPagar.findFirst({ where: { id: pagoId, cuentaId: id }, select: { id: true } });
    if (!pago) throw new ErrorValidacion("Pago no encontrado", 404);
    const adjunto = await almacenamiento.subir(`pagos/${id}`, req.file);
    try {
      await prisma.adjuntoPago.create({ data: { ...adjunto, pagoCuentaPorPagarId: pagoId, usuarioId: req.user.id } });
    } catch (error) {
      await almacenamiento.borrar([adjunto.ruta]);
      throw error;
    }
    res.status(201).json(await cargarCuenta(id));
  } catch (error) {
    responderError(res, error, "adjuntando constancia");
  }
};

// DELETE /documentos/:id/pagos/:pagoId/adjuntos/:adjuntoId
exports.eliminarAdjuntoPago = async (req, res) => {
  try {
    const a = await buscarAdjunto(req);
    if (!a) throw new ErrorValidacion("Adjunto no encontrado", 404);
    await prisma.adjuntoPago.delete({ where: { id: a.id } });
    await almacenamiento.borrar([a.ruta]);
    res.json(await cargarCuenta(Number(req.params.id)));
  } catch (error) {
    responderError(res, error, "eliminando constancia");
  }
};

// GET /documentos/:id/pagos/:pagoId/adjuntos/:adjuntoId → { url } firmada por 10 minutos.
exports.urlAdjuntoPago = async (req, res) => {
  try {
    const a = await buscarAdjunto(req);
    if (!a) throw new ErrorValidacion("Adjunto no encontrado", 404);
    res.json({ url: await almacenamiento.urlFirmada(a.ruta), nombre: a.nombre, tipo: a.tipo });
  } catch (error) {
    responderError(res, error, "abriendo constancia");
  }
};

/* =========================
   CUOTAS DE ALQUILER DE PANELES (arrendadores)
========================= */
const nombreArrendador = (p) => p.razonSocial || p.nombre;

// POST /cuotas-paneles/:id/pagar  body: { fecha, medio, numeroOperacion? }
exports.pagarCuotaPanel = async (req, res) => {
  try {
    const fecha = String(req.body.fecha || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw new ErrorValidacion("Indica una fecha de pago válida (no futura)");
    if (!MEDIOS_PAGO.includes(req.body.medio)) throw new ErrorValidacion(`medio debe ser uno de: ${MEDIOS_PAGO.join(", ")}`);
    const { count } = await prisma.proveedorCuota.updateMany({
      where: { id: Number(req.params.id), estado: "PENDIENTE" },
      data: { estado: "CANCELADO", fechaPago: fechaDia(fecha), medioPago: req.body.medio, numeroOperacion: texto(req.body.numeroOperacion, 60) },
    });
    if (count === 0) throw new ErrorValidacion("La cuota no existe o ya está pagada");
    const cuota = await prisma.proveedorCuota.findUnique({ where: { id: Number(req.params.id) } });
    await sincronizarEstadoContrato(cuota.proveedorId);
    res.json(cuota);
  } catch (error) {
    responderError(res, error, "pagando cuota de panel");
  }
};

// POST /cuotas-paneles/:id/revertir — deshace un pago registrado por error.
exports.revertirCuotaPanel = async (req, res) => {
  try {
    const { count } = await prisma.proveedorCuota.updateMany({
      where: { id: Number(req.params.id), estado: "CANCELADO" },
      data: { estado: "PENDIENTE", fechaPago: null, medioPago: null, numeroOperacion: null },
    });
    if (count === 0) throw new ErrorValidacion("La cuota no existe o no está pagada");
    const cuota = await prisma.proveedorCuota.findUnique({ where: { id: Number(req.params.id) } });
    await sincronizarEstadoContrato(cuota.proveedorId);
    res.json(cuota);
  } catch (error) {
    responderError(res, error, "revirtiendo pago de cuota");
  }
};

/* =========================
   ALERTAS para el Dashboard: detracciones que la empresa debe depositar en la
   cuenta del proveedor (Banco de la Nación), vencidas o que vencen en 7 días.
   GET /alertas → { detracciones: [{ id, numero, nombre, saldo, plazo, dias }] }
========================= */
exports.alertas = async (req, res) => {
  try {
    const hoy = hoyLima();
    const cuentas = await prisma.cuentaPorPagar.findMany({
      where: { anulado: false, detraccionMonto: { gt: 0 } },
      include: INCLUDE_CUENTA,
    });
    const detracciones = [];
    for (const c of cuentas) {
      const pago = resumenPago(c, hoy);
      if (!(pago.saldoDetraccion > 0)) continue;
      const plazo = plazoDetraccion(fechaLima(c.fechaEmision));
      const dias = diasEntre(hoy, plazo);
      if (dias > 7) continue;
      detracciones.push({ id: c.id, numero: `${c.serie}-${c.numero}`, nombre: c.proveedor.razonSocial, saldo: pago.saldoDetraccion, plazo, dias });
    }
    res.json({ detracciones: detracciones.sort((a, b) => a.dias - b.dias) });
  } catch (error) {
    responderError(res, error, "cargando alertas de pago");
  }
};

/* =========================
   CARTERA: documentos abiertos + cuotas de paneles, con antigüedad
   GET /  → { hoy, documentos, proveedores, totales, alertas }
========================= */
exports.resumen = async (req, res) => {
  try {
    const hoy = hoyLima();
    const horizonte = new Date(`${sumarDias(hoy, HORIZONTE_CUOTAS_PANEL)}T23:59:59-05:00`);
    const [cuentas, cuotasPanel] = await Promise.all([
      prisma.cuentaPorPagar.findMany({ where: { anulado: false }, include: INCLUDE_CUENTA }),
      prisma.proveedorCuota.findMany({
        where: { estado: "PENDIENTE", fechaCobro: { lte: horizonte }, proveedor: { activo: true } },
        include: { proveedor: { select: { id: true, nombre: true, razonSocial: true, ubicacion: true, numeroCuenta: true, nombreCuenta: true, estadoOverride: true } } },
      }),
    ]);

    const filas = [];
    for (const c of cuentas) {
      const pago = resumenPago(c, hoy);
      if (!["PENDIENTE", "PARCIAL", "VENCIDO"].includes(pago.estado)) continue;
      filas.push({
        origen: "DOCUMENTO", id: c.id,
        proveedorClave: `C${c.proveedorId}`, proveedorNombre: c.proveedor.razonSocial, proveedorDoc: c.proveedor.ruc,
        documento: `${c.serie}-${c.numero}`, tipoDocumento: c.tipoDocumento, categoria: c.categoria,
        descripcion: c.descripcion, proyecto: c.proyecto,
        fechaEmision: fechaLima(c.fechaEmision), moneda: c.moneda, total: c.total,
        neto: pago.neto, pagado: pago.pagado, saldo: pago.saldo, saldoDetraccion: pago.saldoDetraccion,
        plazoDetraccion: pago.saldoDetraccion > 0 ? plazoDetraccion(fechaLima(c.fechaEmision)) : null,
        estado: pago.estado, vencimiento: pago.vencimiento, diasVencido: pago.diasVencido, tramos: pago.tramos,
      });
    }
    for (const q of cuotasPanel) {
      if (q.proveedor.estadoOverride === "SUSPENDIDO") continue;
      const total = r2(q.monto + q.igv);
      const vencimiento = q.fechaCobro ? fechaLima(q.fechaCobro) : hoy;
      const { tramos, diasVencido } = antiguedad([{ monto: total, fecha: vencimiento }], total, hoy);
      filas.push({
        origen: "PANEL", id: q.id,
        proveedorClave: `P${q.proveedorId}`, proveedorNombre: nombreArrendador(q.proveedor), proveedorDoc: null,
        documento: `Cuota ${q.numero}`, tipoDocumento: "ALQUILER", categoria: "ALQUILER_PANEL",
        descripcion: `Alquiler ${q.proveedor.ubicacion}${q.fecha ? ` — ${q.fecha}` : ""}`, proyecto: null,
        fechaEmision: vencimiento, moneda: "PEN", total,
        neto: total, pagado: 0, saldo: total, saldoDetraccion: 0,
        estado: diasVencido > 0 ? "VENCIDO" : "PENDIENTE", vencimiento, diasVencido, tramos,
        cuenta: [q.proveedor.nombreCuenta, q.proveedor.numeroCuenta].filter(Boolean).join(" — ") || null,
      });
    }

    const proveedores = new Map();
    const totales = {};
    let detraccionPorPagar = 0;
    for (const f of filas) {
      const clave = `${f.proveedorClave}|${f.moneda}`;
      if (!proveedores.has(clave)) {
        proveedores.set(clave, { clave: f.proveedorClave, nombre: f.proveedorNombre, doc: f.proveedorDoc, moneda: f.moneda, saldo: 0, documentos: 0, diasVencidoMax: 0, tramos: tramosVacios() });
      }
      const p = proveedores.get(clave);
      p.saldo = r2(p.saldo + f.saldo);
      p.documentos++;
      p.diasVencidoMax = Math.max(p.diasVencidoMax, f.diasVencido);
      sumarTramos(p.tramos, f.tramos);
      totales[f.moneda] ??= { saldo: 0, tramos: tramosVacios() };
      totales[f.moneda].saldo = r2(totales[f.moneda].saldo + f.saldo);
      sumarTramos(totales[f.moneda].tramos, f.tramos);
      detraccionPorPagar = r2(detraccionPorPagar + f.saldoDetraccion);
    }

    const montos = (lista) => lista.reduce((a, f) => ({ ...a, [f.moneda]: r2((a[f.moneda] || 0) + f.saldo) }), {});
    const vencidos = filas.filter((f) => f.diasVencido > 0);
    const porVencer = filas.filter((f) => f.vencimiento && f.vencimiento >= hoy && diasEntre(hoy, f.vencimiento) <= 7);

    res.json({
      hoy,
      horizonteCuotasPanel: HORIZONTE_CUOTAS_PANEL,
      documentos: filas.sort((a, b) => b.diasVencido - a.diasVencido || (a.vencimiento || "").localeCompare(b.vencimiento || "")),
      proveedores: [...proveedores.values()].sort((a, b) => b.diasVencidoMax - a.diasVencidoMax || b.saldo - a.saldo),
      totales,
      detraccionPorPagar,
      alertas: {
        vencidos: { cantidad: vencidos.length, montos: montos(vencidos) },
        porVencer: { cantidad: porVencer.length, montos: montos(porVencer) },
      },
    });
  } catch (error) {
    responderError(res, error, "cargando cuentas por pagar");
  }
};

// GET /opciones — catálogos y lo que se puede vincular a un documento.
exports.opciones = async (req, res) => {
  try {
    const [proyectos, ordenes, movimientos] = await Promise.all([
      prisma.proyecto.findMany({
        where: { estado: { not: "CANCELADO" } },
        select: { id: true, nombre: true, estado: true, cliente: { select: { nombreComercial: true } } },
        orderBy: { id: "desc" },
        take: 200,
      }),
      prisma.ordenAlmacen.findMany({
        where: { tipo: "ENTRADA" },
        select: { id: true, fecha: true, notas: true, items: { select: { cantidad: true, precioUnitario: true, item: { select: { nombre: true } } } } },
        orderBy: { fecha: "desc" },
        take: 100,
      }),
      prisma.movimientoAlmacen.findMany({
        where: { tipo: "ENTRADA", ordenId: null },
        select: { id: true, fecha: true, cantidad: true, precioTotal: true, item: { select: { codigo: true, nombre: true } } },
        orderBy: { fecha: "desc" },
        take: 100,
      }),
    ]);
    res.json({
      tiposDocumento: TIPOS_DOCUMENTO, categorias: CATEGORIAS, medios: MEDIOS_PAGO, monedas: MONEDAS,
      proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.nombre, estado: p.estado, cliente: p.cliente?.nombreComercial || null })),
      ordenesAlmacen: ordenes.map((o) => ({
        id: o.id, fecha: fechaLima(o.fecha), notas: o.notas,
        total: r2(o.items.reduce((a, it) => a + it.cantidad * it.precioUnitario, 0)),
        resumen: o.items.map((it) => it.item.nombre).slice(0, 3).join(", ") + (o.items.length > 3 ? "…" : ""),
      })),
      movimientosAlmacen: movimientos.map((m) => ({
        id: m.id, fecha: fechaLima(m.fecha), total: m.precioTotal, resumen: `${m.item.codigo} ${m.item.nombre} × ${m.cantidad}`,
      })),
    });
  } catch (error) {
    responderError(res, error, "cargando opciones");
  }
};

// Gasto real de un proyecto según las facturas de proveedores vinculadas (en soles).
exports.gastoDeProyecto = async (proyectoId) => {
  const cuentas = await prisma.cuentaPorPagar.findMany({
    where: { proyectoId, anulado: false },
    select: { id: true, serie: true, numero: true, fechaEmision: true, moneda: true, tipoCambio: true, valorVenta: true, total: true, proveedor: { select: { razonSocial: true } } },
    orderBy: { fechaEmision: "asc" },
  });
  const enSoles = (c, v) => (c.moneda === "PEN" ? v : r2(v * (c.tipoCambio || 1)));
  return {
    // Sin IGV (el IGV de compras es crédito fiscal, no costo del proyecto).
    totalSinIgv: r2(cuentas.reduce((a, c) => a + enSoles(c, c.valorVenta), 0)),
    documentos: cuentas.map((c) => ({
      id: c.id, documento: `${c.serie}-${c.numero}`, fecha: fechaLima(c.fechaEmision), proveedor: c.proveedor.razonSocial,
      moneda: c.moneda, valorVenta: c.valorVenta, total: c.total, valorVentaSoles: enSoles(c, c.valorVenta),
    })),
  };
};
