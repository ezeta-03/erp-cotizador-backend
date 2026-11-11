// Compras: proveedores propuestos por ítem de almacén (la regla es proponer 3,
// con su último precio) y órdenes de compra con validación de Finanzas.
// Flujo de la orden: BORRADOR → PENDIENTE (enviada a Finanzas) → APROBADA o
// RECHAZADA → RECIBIDA_PARCIAL → RECIBIDA; o ANULADA. Al recibirla entra al
// almacén (orden de entrada) y se actualizan el precio del proveedor y el costo
// del ítem. Se paga vía Cuentas por pagar (documentos vinculados a la orden).
const prisma = require("../config/prisma");
const { IGV_RATE } = require("../config/negocio");
const { emisor } = require("../config/emisor");
const migo = require("../services/migo.client");
const { r2, hoyLima, TOLERANCIA } = require("../services/cobros.service");
const { fechaLima } = require("../services/antiguedad.service");
const { leerCondicion } = require("../utils/condicionPago");
const { htmlAPdf } = require("../services/pdf.service");
const { resumenPago } = require("./cuentasPorPagar.controller");
const { etiquetaDocumento } = require("../utils/documentoPorPagar");
const ordenCompraPdf = require("../templates/ordenCompraPdf.template");

const PROVEEDORES_PROPUESTOS = 3;
const MONEDAS = ["PEN", "USD"];
const ESTADOS = ["BORRADOR", "PENDIENTE", "APROBADA", "RECHAZADA", "RECIBIDA_PARCIAL", "RECIBIDA", "ANULADA"];
const EDITABLES = ["BORRADOR", "RECHAZADA"];
const RECIBIBLES = ["APROBADA", "RECIBIDA_PARCIAL"];
const ROLES_FINANZAS = ["ADMIN", "CONTABLE"];

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
  if (error instanceof migo.ErrorMigo) return res.status(error.status || 502).json({ message: error.message });
  console.error(`❌ Error ${contexto}:`, error);
  res.status(500).json({ message: `Error ${contexto}`, error: error.message });
}

const texto = (v, max = 500) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const fechaDia = (f) => new Date(`${f}T12:00:00-05:00`);
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

/* =========================
   PROVEEDORES PROPUESTOS POR ÍTEM
========================= */
const SELECT_PROPUESTO = {
  id: true, proveedorId: true, precio: true, moneda: true, fechaPrecio: true, origen: true,
  proveedor: { select: { id: true, razonSocial: true, ruc: true, activo: true } },
};
const propuestosDe = (itemAlmacenId) => prisma.itemProveedor.findMany({
  where: { itemAlmacenId }, select: SELECT_PROPUESTO, orderBy: [{ precio: "asc" }, { id: "asc" }],
});

// GET /items/:id/proveedores
exports.listarPropuestos = async (req, res) => {
  try {
    res.json(await propuestosDe(Number(req.params.id)));
  } catch (error) {
    responderError(res, error, "listando proveedores propuestos");
  }
};

// PUT /items/:id/proveedores  body: { proveedores: [{ proveedorId, precio, moneda? }] } (hasta 3; reemplaza la lista)
exports.guardarPropuestos = async (req, res) => {
  try {
    const itemAlmacenId = Number(req.params.id);
    if (!(await prisma.itemAlmacen.findUnique({ where: { id: itemAlmacenId }, select: { id: true } }))) {
      throw new ErrorValidacion("Ítem no encontrado", 404);
    }
    const lista = Array.isArray(req.body.proveedores) ? req.body.proveedores : [];
    if (lista.length > PROVEEDORES_PROPUESTOS) throw new ErrorValidacion(`Propón como máximo ${PROVEEDORES_PROPUESTOS} proveedores por ítem`);
    const filas = lista.map((p, i) => {
      const proveedorId = Number(p.proveedorId);
      const precio = r2(Number(p.precio));
      const moneda = String(p.moneda || "PEN").toUpperCase();
      if (!proveedorId) throw new ErrorValidacion(`Proveedor ${i + 1}: elige el proveedor`);
      if (!(precio >= 0)) throw new ErrorValidacion(`Proveedor ${i + 1}: indica un precio válido`);
      if (!MONEDAS.includes(moneda)) throw new ErrorValidacion("moneda debe ser PEN o USD");
      return { proveedorId, precio, moneda };
    });
    if (new Set(filas.map((f) => f.proveedorId)).size !== filas.length) throw new ErrorValidacion("Un proveedor está repetido");
    const existentes = await prisma.proveedorCompra.count({ where: { id: { in: filas.map((f) => f.proveedorId) } } });
    if (existentes !== filas.length) throw new ErrorValidacion("Algún proveedor no existe");

    // Se conserva la fecha del precio si no cambió.
    const actuales = new Map((await prisma.itemProveedor.findMany({ where: { itemAlmacenId } })).map((x) => [x.proveedorId, x]));
    await prisma.$transaction([
      prisma.itemProveedor.deleteMany({ where: { itemAlmacenId, proveedorId: { notIn: filas.map((f) => f.proveedorId) } } }),
      ...filas.map((f) => {
        const previo = actuales.get(f.proveedorId);
        const cambio = !previo || previo.precio !== f.precio || previo.moneda !== f.moneda;
        return prisma.itemProveedor.upsert({
          where: { itemAlmacenId_proveedorId: { itemAlmacenId, proveedorId: f.proveedorId } },
          create: { itemAlmacenId, ...f },
          update: cambio ? { precio: f.precio, moneda: f.moneda, fechaPrecio: new Date(), origen: "MANUAL" } : {},
        });
      }),
    ]);
    res.json(await propuestosDe(itemAlmacenId));
  } catch (error) {
    responderError(res, error, "guardando proveedores propuestos");
  }
};

/* =========================
   ÓRDENES DE COMPRA
========================= */
const INCLUDE_OC = {
  proveedor: { select: { id: true, razonSocial: true, ruc: true, tipoDocIdentidad: true, direccion: true, contacto: true, telefono: true, email: true, banco: true, numeroCuenta: true, cci: true } },
  proyecto: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, nombre: true } },
  aprobadoPor: { select: { id: true, nombre: true } },
  items: {
    orderBy: { id: "asc" },
    include: {
      item: {
        select: {
          id: true, codigo: true, nombre: true, unidad: true, stockActual: true,
          proveedores: { select: { proveedorId: true, precio: true, moneda: true } },
        },
      },
      solicitud: { select: { id: true, estado: true, proyecto: { select: { nombre: true } } } },
    },
  },
  recepciones: { select: { id: true, fecha: true, notas: true, items: { select: { itemAlmacenId: true, cantidad: true } } }, orderBy: { fecha: "asc" } },
  cuentasPorPagar: { where: { anulado: false }, include: { pagos: { select: { tipo: true, monto: true } } } },
};

// Estado de pago según los documentos de Cuentas por pagar vinculados.
function estadoPago(oc) {
  const docs = oc.cuentasPorPagar.map((c) => ({ c, pago: resumenPago(c) }));
  const facturado = r2(docs.reduce((a, d) => a + d.c.total, 0));
  const pagado = r2(docs.reduce((a, d) => a + d.pago.pagado, 0));
  let estado = "SIN_FACTURA";
  if (docs.length) {
    const todoPagado = docs.every((d) => d.pago.estado === "PAGADO");
    if (todoPagado && facturado >= oc.total - TOLERANCIA) estado = "PAGADA";
    else if (docs.some((d) => d.pago.pagado > 0 || d.pago.detraccionPagada > 0)) estado = "PARCIAL";
    else estado = "PENDIENTE";
  }
  return {
    estado, facturado, pagado,
    documentos: docs.map(({ c, pago }) => ({ id: c.id, documento: etiquetaDocumento(c), total: c.total, moneda: c.moneda, estado: pago.estado, saldo: pago.saldo })),
  };
}

function serializar(oc) {
  const { cuentasPorPagar, ...resto } = oc;
  return {
    ...resto,
    fechaEntrega: oc.fechaEntrega ? fechaLima(oc.fechaEntrega) : null,
    items: oc.items.map((l) => ({
      ...l,
      pendiente: r2(Math.max(l.cantidad - l.cantidadRecibida, 0)),
      subtotal: r2(l.cantidad * l.precioUnitario),
      propuestos: l.item.proveedores.length,
    })),
    // Regla de 3 proveedores propuestos: aviso, no bloquea.
    faltanCotizaciones: [...new Map(oc.items
      .filter((l) => l.item.proveedores.length < PROVEEDORES_PROPUESTOS)
      .map((l) => [l.item.id, { itemAlmacenId: l.item.id, codigo: l.item.codigo, nombre: l.item.nombre, propuestos: l.item.proveedores.length }])).values()],
    pago: estadoPago(oc),
  };
}

async function cargar(id) {
  const oc = await prisma.ordenCompra.findUnique({ where: { id }, include: INCLUDE_OC });
  if (!oc) throw new ErrorValidacion("Orden de compra no encontrada", 404);
  return oc;
}

async function siguienteNumero(tx = prisma) {
  const ultima = await tx.ordenCompra.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  const n = ultima ? Number(ultima.numero.slice(3)) + 1 : 1;
  return `OC-${String(n).padStart(6, "0")}`;
}

// Valida el body y devuelve la cabecera y las líneas (sin número, estado ni usuario).
async function prepararOrden(body) {
  const proveedorId = Number(body.proveedorId);
  const proveedor = proveedorId ? await prisma.proveedorCompra.findUnique({ where: { id: proveedorId } }) : null;
  if (!proveedor) throw new ErrorValidacion("Elige el proveedor");
  if (!proveedor.activo) throw new ErrorValidacion(`El proveedor ${proveedor.razonSocial} está desactivado`);

  const moneda = String(body.moneda || "PEN").toUpperCase();
  if (!MONEDAS.includes(moneda)) throw new ErrorValidacion("moneda debe ser PEN o USD");
  const tipoCambio = moneda === "USD" ? Number(body.tipoCambio) || (await migo.tipoCambioVenta(hoyLima())).venta : null;

  const condicion = leerCondicion(body) || { condicionPago: proveedor.condicionPago, diasCredito: proveedor.diasCredito };
  const fechaEntrega = body.fechaEntrega ? String(body.fechaEntrega).slice(0, 10) : null;
  if (fechaEntrega && !fechaValida(fechaEntrega)) throw new ErrorValidacion("Fecha de entrega no válida");

  const proyectoId = body.proyectoId ? Number(body.proyectoId) : null;
  if (proyectoId && !(await prisma.proyecto.findUnique({ where: { id: proyectoId }, select: { id: true } }))) {
    throw new ErrorValidacion("Proyecto no encontrado");
  }

  const lineas = Array.isArray(body.items) ? body.items : [];
  if (!lineas.length) throw new ErrorValidacion("Agrega al menos un ítem");
  const ids = lineas.map((l) => Number(l.itemAlmacenId));
  const items = new Map((await prisma.itemAlmacen.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, activo: true, proveedores: { where: { proveedorId }, select: { precio: true, moneda: true } } },
  })).map((i) => [i.id, i]));
  const solicitudIds = lineas.map((l) => Number(l.solicitudAlmacenId)).filter(Boolean);
  const solicitudes = new Map((await prisma.solicitudAlmacen.findMany({
    where: { id: { in: solicitudIds } }, select: { id: true, estado: true, itemAlmacenId: true },
  })).map((s) => [s.id, s]));

  const filas = lineas.map((l, i) => {
    const item = items.get(Number(l.itemAlmacenId));
    if (!item) throw new ErrorValidacion(`Línea ${i + 1}: ítem no encontrado`);
    const cantidad = Number(l.cantidad);
    if (!(cantidad > 0)) throw new ErrorValidacion(`Línea ${i + 1} (${item.nombre}): la cantidad debe ser mayor a 0`);
    // Precio: el indicado o el último de este proveedor (si está en la misma moneda).
    const propuesto = item.proveedores[0];
    const precioUnitario = l.precioUnitario !== undefined && l.precioUnitario !== "" && l.precioUnitario !== null
      ? r2(Number(l.precioUnitario))
      : propuesto && propuesto.moneda === moneda ? propuesto.precio : NaN;
    if (!(precioUnitario >= 0)) throw new ErrorValidacion(`Línea ${i + 1} (${item.nombre}): indica el precio unitario`);
    const solicitudAlmacenId = l.solicitudAlmacenId ? Number(l.solicitudAlmacenId) : null;
    if (solicitudAlmacenId) {
      const s = solicitudes.get(solicitudAlmacenId);
      if (!s) throw new ErrorValidacion(`Línea ${i + 1}: solicitud no encontrada`);
      if (s.itemAlmacenId !== item.id) throw new ErrorValidacion(`Línea ${i + 1}: la solicitud es de otro ítem`);
    }
    return { itemAlmacenId: item.id, cantidad, precioUnitario, solicitudAlmacenId };
  });

  const valorVenta = r2(filas.reduce((a, f) => a + f.cantidad * f.precioUnitario, 0));
  const igv = r2(valorVenta * IGV_RATE);
  return {
    cabecera: {
      proveedorId, moneda, tipoCambio, ...condicion,
      fechaEntrega: fechaEntrega ? fechaDia(fechaEntrega) : null,
      proyectoId, notas: texto(body.notas),
      valorVenta, igv, total: r2(valorVenta + igv),
    },
    filas,
  };
}

// GET /ordenes?estado=&proveedorId=&buscar=
exports.listar = async (req, res) => {
  try {
    const estado = String(req.query.estado || "").toUpperCase();
    const buscar = String(req.query.buscar || "").trim();
    const ordenes = await prisma.ordenCompra.findMany({
      where: {
        ...(ESTADOS.includes(estado) && { estado }),
        ...(req.query.proveedorId && { proveedorId: Number(req.query.proveedorId) }),
        ...(buscar && {
          OR: [
            { numero: { contains: buscar, mode: "insensitive" } },
            { proveedor: { razonSocial: { contains: buscar, mode: "insensitive" } } },
            { items: { some: { item: { nombre: { contains: buscar, mode: "insensitive" } } } } },
          ],
        }),
      },
      include: INCLUDE_OC,
      orderBy: { id: "desc" },
      take: 300,
    });
    const conteo = await prisma.ordenCompra.groupBy({ by: ["estado"], _count: { _all: true } });
    res.json({
      ordenes: ordenes.map(serializar),
      porEstado: Object.fromEntries(conteo.map((c) => [c.estado, c._count._all])),
    });
  } catch (error) {
    responderError(res, error, "listando órdenes de compra");
  }
};

exports.obtener = async (req, res) => {
  try {
    res.json(serializar(await cargar(Number(req.params.id))));
  } catch (error) {
    responderError(res, error, "obteniendo orden de compra");
  }
};

// POST /ordenes  body: { proveedorId, moneda?, tipoCambio?, condicionPago?, diasCredito?, fechaEntrega?,
//   proyectoId?, notas?, items: [{ itemAlmacenId, cantidad, precioUnitario?, solicitudAlmacenId? }], enviar? }
exports.crear = async (req, res) => {
  try {
    const { cabecera, filas } = await prepararOrden(req.body);
    const enviar = !!req.body.enviar;
    let id;
    for (let intento = 1; ; intento++) {
      try {
        ({ id } = await prisma.ordenCompra.create({
          data: {
            ...cabecera, numero: await siguienteNumero(), creadoPorId: req.user.id,
            estado: enviar ? "PENDIENTE" : "BORRADOR", enviadaAt: enviar ? new Date() : null,
            items: { create: filas },
          },
          select: { id: true },
        }));
        break;
      } catch (error) {
        if (!(error.code === "P2002" && intento < 3)) throw error;
      }
    }
    res.status(201).json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "creando orden de compra");
  }
};

// Solo quien la creó (o un Admin) cambia una orden en borrador o rechazada.
function puedeEditar(oc, user) {
  if (!EDITABLES.includes(oc.estado)) throw new ErrorValidacion("Solo se edita una orden en borrador o rechazada");
  if (oc.creadoPorId !== user.id && user.role !== "ADMIN") throw new ErrorValidacion("Solo quien creó la orden puede cambiarla", 403);
}

// PUT /ordenes/:id — mismos campos que crear; queda en borrador (o pendiente con enviar).
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actual = await cargar(id);
    puedeEditar(actual, req.user);
    const { cabecera, filas } = await prepararOrden({ ...actual, fechaEntrega: actual.fechaEntrega && fechaLima(actual.fechaEntrega), ...req.body });
    const enviar = !!req.body.enviar;
    await prisma.$transaction([
      prisma.ordenCompraItem.deleteMany({ where: { ordenCompraId: id } }),
      prisma.ordenCompra.update({
        where: { id },
        data: {
          ...cabecera, estado: enviar ? "PENDIENTE" : "BORRADOR", enviadaAt: enviar ? new Date() : null,
          motivoRechazo: enviar ? null : actual.motivoRechazo,
          items: { create: filas },
        },
      }),
    ]);
    res.json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "actualizando orden de compra");
  }
};

// POST /ordenes/:id/enviar — a validación de Finanzas.
exports.enviar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const oc = await cargar(id);
    puedeEditar(oc, req.user);
    await prisma.ordenCompra.update({ where: { id }, data: { estado: "PENDIENTE", enviadaAt: new Date(), motivoRechazo: null } });
    res.json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "enviando orden de compra");
  }
};

// POST /ordenes/:id/aprobar  body: { comentario? } — Finanzas (Admin o Contable), nunca quien la creó.
exports.aprobar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const oc = await cargar(id);
    if (oc.estado !== "PENDIENTE") throw new ErrorValidacion("Solo se aprueba una orden pendiente de validación");
    if (oc.creadoPorId === req.user.id) throw new ErrorValidacion("Quien creó la orden no puede aprobarla: la valida otra persona de Finanzas", 403);
    await prisma.ordenCompra.update({
      where: { id },
      data: { estado: "APROBADA", aprobadoPorId: req.user.id, aprobadoAt: new Date(), comentarioFinanzas: texto(req.body.comentario), motivoRechazo: null },
    });
    res.json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "aprobando orden de compra");
  }
};

// POST /ordenes/:id/rechazar  body: { motivo } — vuelve a quien la creó para corregirla.
exports.rechazar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const oc = await cargar(id);
    if (oc.estado !== "PENDIENTE") throw new ErrorValidacion("Solo se rechaza una orden pendiente de validación");
    const motivo = texto(req.body.motivo);
    if (!motivo) throw new ErrorValidacion("Indica el motivo del rechazo");
    await prisma.ordenCompra.update({
      where: { id }, data: { estado: "RECHAZADA", motivoRechazo: motivo, aprobadoPorId: req.user.id, aprobadoAt: new Date() },
    });
    res.json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "rechazando orden de compra");
  }
};

// POST /ordenes/:id/anular — sin recepciones ni facturas vinculadas.
exports.anular = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const oc = await cargar(id);
    if (["ANULADA", "RECIBIDA", "RECIBIDA_PARCIAL"].includes(oc.estado)) throw new ErrorValidacion(`No se puede anular una orden ${oc.estado.toLowerCase().replace("_", " ")}`);
    if (oc.cuentasPorPagar.length) throw new ErrorValidacion("Tiene facturas vinculadas en Cuentas por pagar: anúlalas o desvincúlalas primero");
    if (oc.creadoPorId !== req.user.id && !ROLES_FINANZAS.includes(req.user.role)) {
      throw new ErrorValidacion("Solo quien la creó o Finanzas pueden anularla", 403);
    }
    await prisma.ordenCompra.update({ where: { id }, data: { estado: "ANULADA" } });
    res.json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "anulando orden de compra");
  }
};

// POST /ordenes/:id/recibir  body: { fecha?, documento, lineas: [{ id, cantidad }] }
// Crea la orden de entrada de almacén, suma el stock, actualiza el costo del
// ítem y el precio de este proveedor (en soles), y marca lo recibido.
exports.recibir = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const oc = await cargar(id);
    if (!RECIBIBLES.includes(oc.estado)) throw new ErrorValidacion("Solo se recibe una orden aprobada por Finanzas");
    const documento = texto(req.body.documento, 120);
    if (!documento) throw new ErrorValidacion("Indica el N° de guía o factura con que llegó la mercadería");
    const fecha = req.body.fecha ? String(req.body.fecha).slice(0, 10) : hoyLima();
    if (!fechaValida(fecha) || fecha > hoyLima()) throw new ErrorValidacion("Indica una fecha de recepción válida (no futura)");

    const porId = new Map(oc.items.map((l) => [l.id, l]));
    const recibir = (Array.isArray(req.body.lineas) ? req.body.lineas : [])
      .map((x) => ({ linea: porId.get(Number(x.id)), cantidad: Number(x.cantidad) }))
      .filter((x) => x.cantidad > 0);
    if (!recibir.length) throw new ErrorValidacion("Indica la cantidad recibida de al menos un ítem");
    for (const { linea, cantidad } of recibir) {
      if (!linea) throw new ErrorValidacion("Línea no encontrada en la orden");
      const pendiente = r2(linea.cantidad - linea.cantidadRecibida);
      if (cantidad > pendiente + TOLERANCIA) throw new ErrorValidacion(`${linea.item.nombre}: se recibe como máximo lo pendiente (${pendiente})`);
    }

    const enSoles = (precio) => (oc.moneda === "USD" ? r2(precio * (oc.tipoCambio || 1)) : precio);
    const fechaRecepcion = fechaDia(fecha);
    await prisma.$transaction(async (tx) => {
      const entrada = await tx.ordenAlmacen.create({
        data: {
          tipo: "ENTRADA", ordenCompraId: oc.id, fecha: fechaRecepcion, usuarioId: req.user.id,
          notas: `${oc.numero} · ${documento}`,
        },
      });
      for (const { linea, cantidad } of recibir) {
        const precio = enSoles(linea.precioUnitario);
        await tx.ordenAlmacenItem.create({ data: { ordenId: entrada.id, itemAlmacenId: linea.itemAlmacenId, cantidad, precioUnitario: precio } });
        await tx.movimientoAlmacen.create({
          data: {
            tipo: "ENTRADA", itemAlmacenId: linea.itemAlmacenId, cantidad, precioUnitario: precio, precioTotal: r2(cantidad * precio),
            fecha: fechaRecepcion, notas: `${oc.numero} · ${oc.proveedor.razonSocial} · ${documento}`, usuarioId: req.user.id, ordenId: entrada.id,
          },
        });
        await tx.itemAlmacen.update({ where: { id: linea.itemAlmacenId }, data: { stockActual: { increment: cantidad }, costoUnitario: precio } });
        await tx.ordenCompraItem.update({ where: { id: linea.id }, data: { cantidadRecibida: { increment: cantidad } } });
        // Precio del proveedor actualizado con la compra (en la moneda de la orden).
        await tx.itemProveedor.upsert({
          where: { itemAlmacenId_proveedorId: { itemAlmacenId: linea.itemAlmacenId, proveedorId: oc.proveedorId } },
          create: { itemAlmacenId: linea.itemAlmacenId, proveedorId: oc.proveedorId, precio: linea.precioUnitario, moneda: oc.moneda, fechaPrecio: fechaRecepcion, origen: "COMPRA" },
          update: { precio: linea.precioUnitario, moneda: oc.moneda, fechaPrecio: fechaRecepcion, origen: "COMPRA" },
        });
      }
      const lineas = await tx.ordenCompraItem.findMany({ where: { ordenCompraId: oc.id } });
      const completa = lineas.every((l) => l.cantidadRecibida >= l.cantidad - TOLERANCIA);
      await tx.ordenCompra.update({ where: { id: oc.id }, data: { estado: completa ? "RECIBIDA" : "RECIBIDA_PARCIAL" } });
    });
    res.json(serializar(await cargar(id)));
  } catch (error) {
    responderError(res, error, "recibiendo orden de compra");
  }
};

// GET /ordenes/:id/pdf
exports.pdf = async (req, res) => {
  try {
    const oc = await cargar(Number(req.params.id));
    if (["BORRADOR", "ANULADA"].includes(oc.estado)) throw new ErrorValidacion(`La orden está ${oc.estado === "BORRADOR" ? "en borrador" : "anulada"}: no se envía al proveedor`);
    const pdf = await htmlAPdf(ordenCompraPdf({ oc: serializar(oc), emisor }));
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=${oc.numero}.pdf` });
    res.send(pdf);
  } catch (error) {
    responderError(res, error, "generando PDF de la orden de compra");
  }
};

// GET /sugerencias — qué comprar: ítems bajo su stock mínimo y solicitudes
// pendientes sin stock suficiente, sin una orden de compra en curso.
exports.sugerencias = async (req, res) => {
  try {
    const EN_CURSO = ["BORRADOR", "PENDIENTE", "APROBADA", "RECIBIDA_PARCIAL"];
    const selectItem = {
      id: true, codigo: true, nombre: true, unidad: true, stockActual: true, stockMinimo: true, stockMaximo: true, costoUnitario: true,
      proveedores: { select: SELECT_PROPUESTO, orderBy: { precio: "asc" } },
      ordenCompraItems: { where: { ordenCompra: { estado: { in: EN_CURSO } } }, select: { ordenCompra: { select: { id: true, numero: true, estado: true } } } },
    };
    const [items, solicitudes] = await Promise.all([
      prisma.itemAlmacen.findMany({ where: { activo: true, stockMinimo: { gt: 0 } }, select: selectItem, orderBy: { nombre: "asc" } }),
      prisma.solicitudAlmacen.findMany({
        where: { estado: "PENDIENTE" },
        include: {
          item: { select: selectItem },
          proyecto: { select: { id: true, nombre: true } },
          ordenCompraItems: { where: { ordenCompra: { estado: { in: EN_CURSO } } }, select: { ordenCompra: { select: { id: true, numero: true, estado: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const enCurso = (lista) => lista.map((x) => x.ordenCompra);
    res.json({
      stockBajo: items
        .filter((i) => i.stockActual < i.stockMinimo)
        .map(({ ordenCompraItems, ...i }) => ({
          ...i, ordenesEnCurso: enCurso(ordenCompraItems),
          // Para llegar al máximo (o al mínimo si no hay máximo).
          sugerido: r2(Math.max((i.stockMaximo > i.stockMinimo ? i.stockMaximo : i.stockMinimo) - i.stockActual, 0)),
        })),
      solicitudes: solicitudes
        .filter((s) => s.item.stockActual < s.cantidad)
        .map(({ item: { ordenCompraItems, ...item }, ordenCompraItems: propias, ...s }) => ({
          ...s, item, ordenesEnCurso: enCurso(propias),
          faltante: r2(s.cantidad - Math.max(item.stockActual, 0)),
        })),
    });
  } catch (error) {
    responderError(res, error, "calculando sugerencias de compra");
  }
};

// GET /opciones — proveedores, proyectos e ítems (con sus proveedores propuestos).
exports.opciones = async (req, res) => {
  try {
    const [proveedores, proyectos, items] = await Promise.all([
      prisma.proveedorCompra.findMany({
        where: { activo: true },
        select: { id: true, razonSocial: true, ruc: true, condicionPago: true, diasCredito: true, tipo: true },
        orderBy: { razonSocial: "asc" },
      }),
      prisma.proyecto.findMany({ where: { estado: { not: "CANCELADO" } }, select: { id: true, nombre: true }, orderBy: { id: "desc" }, take: 200 }),
      prisma.itemAlmacen.findMany({
        where: { activo: true },
        select: {
          id: true, codigo: true, nombre: true, unidad: true, stockActual: true, stockMinimo: true, costoUnitario: true,
          proveedores: { select: SELECT_PROPUESTO, orderBy: { precio: "asc" } },
        },
        orderBy: { nombre: "asc" },
      }),
    ]);
    res.json({ proveedores, proyectos, items, monedas: MONEDAS, estados: ESTADOS, proveedoresPropuestos: PROVEEDORES_PROPUESTOS, igv: IGV_RATE });
  } catch (error) {
    responderError(res, error, "cargando opciones de compras");
  }
};

module.exports.ESTADOS_OC = ESTADOS;
