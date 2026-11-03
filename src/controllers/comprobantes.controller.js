const prisma = require("../config/prisma");
const { IGV_RATE } = require("../config/negocio");
const { emisor, series, detraccion, RETENCION_PORCENTAJE, validarConfiguracion } = require("../config/emisor");
const { nombreArchivo, numeroDocumento, CODIGO_TIPO } = require("../services/sunat/ubl");
const { emitir, siguienteCorrelativo, r2 } = require("../services/facturacion.service");
const migo = require("../services/migo.client");
const { resumenCobro, TIPOS_PAGO, MEDIOS_PAGO, MOTIVOS_NC_TOTAL, TOLERANCIA } = require("../services/cobros.service");
const { enviarComprobantePorCorreo } = require("../services/correoComprobante.service");
const { htmlAPdf } = require("../services/pdf.service");
const comprobantePdfTemplate = require("../templates/comprobantePdf.template");
const QRCode = require("qrcode");
const almacenamiento = require("../services/almacenamiento.service");

// Catálogos 09 (nota de crédito) y 10 (nota de débito). Los motivos "total"
// anulan el comprobante copiando todos sus ítems; el resto lleva ítems propios
// (lo devuelto, el descuento o el cargo adicional).
const MOTIVOS_NOTA = {
  NOTA_CREDITO: {
    "01": "Anulación de la operación",
    "02": "Anulación por error en el RUC",
    "06": "Devolución total",
    "04": "Descuento global",
    "05": "Descuento por ítem",
    "07": "Devolución por ítem",
    "09": "Disminución en el valor",
  },
  NOTA_DEBITO: {
    "01": "Intereses por mora",
    "02": "Aumento en el valor",
    "03": "Penalidades / otros conceptos",
  },
};
const esNotaTotal = (tipo, motivo) => tipo === "NOTA_CREDITO" && MOTIVOS_NC_TOTAL.includes(motivo);

const MONEDAS = ["PEN", "USD"];
const simbolo = (moneda) => (moneda === "USD" ? "US$" : "S/");

// Catálogo 03 (unidades de medida) admitidas en el ERP.
const UNIDADES = ["NIU", "ZZ", "MTK", "MTR", "KGM"];

// Sin el XML/CDR completos: el listado no necesita cargar decenas de KB por fila.
const SELECT_RESUMEN = {
  id: true, tipo: true, serie: true, correlativo: true, fechaEmision: true, moneda: true,
  clienteTipoDoc: true, clienteNumDoc: true, clienteNombre: true,
  valorVenta: true, igv: true, total: true, estado: true, sunatCodigo: true, sunatMensaje: true,
  hash: true, cotizacionId: true, referenciaId: true, motivoCodigo: true, createdAt: true,
  formaPago: true, cuotas: true, detraccionMonto: true, detraccionPorcentaje: true, validacionSunat: true, validadoAt: true,
  tipoCambio: true, agenteRetencion: true, motivoDescripcion: true, correoEnviadoA: true, correoEnviadoAt: true,
  origen: true, recordatorioEnviadoAt: true, clienteId: true, observacion: true,
};

// Notas aceptadas que modifican un comprobante (para su estado de cobro).
const NOTAS_ACEPTADAS = { where: { estado: "ACEPTADO" }, select: { tipo: true, motivoCodigo: true, total: true } };

// Para calcular el estado de cobro junto con el resumen.
const SELECT_CON_COBRO = {
  ...SELECT_RESUMEN,
  pagos: { select: { tipo: true, monto: true } },
  notasCredito: NOTAS_ACEPTADAS,
};

const conCobro = ({ pagos, notasCredito, ...c }) => ({
  ...conNumero(c),
  cobro: resumenCobro(c, pagos, notasCredito),
});

const conNumero = (c) => c && { ...c, numero: numeroDocumento(c.serie, c.correlativo) };

const sinArchivos = ({ xmlFirmado, cdrXml, ...resto }) => ({
  ...conNumero(resto),
  tieneXml: !!xmlFirmado,
  tieneCdr: !!cdrXml,
});

// Documento de identidad del receptor según el catálogo 06.
function documentoCliente(documento) {
  const doc = String(documento || "").trim();
  if (/^(10|15|17|20)\d{9}$/.test(doc)) return { tipo: "6", numero: doc };
  if (/^\d{8}$/.test(doc)) return { tipo: "1", numero: doc };
  return null;
}

function configIncompleta(res) {
  const faltan = validarConfiguracion();
  if (faltan.length === 0) return false;
  res.status(503).json({ message: `Facturación electrónica sin configurar. Faltan: ${faltan.join(", ")}` });
  return true;
}

class ErrorValidacion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

function sumarDias(fechaIso, dias) {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Ítems validados con valor de venta e IGV por línea, y los totales.
function prepararLineas(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ErrorValidacion("El comprobante debe tener al menos un ítem");
  const lineas = items.map((it, i) => {
    const cantidad = Number(it.cantidad);
    const valorUnitario = Number(it.valorUnitario);
    const descripcion = String(it.descripcion || "").trim();
    if (!descripcion) throw new ErrorValidacion(`Ítem ${i + 1}: falta la descripción`);
    if (!(cantidad > 0)) throw new ErrorValidacion(`Ítem ${i + 1}: la cantidad debe ser mayor a 0`);
    if (!(valorUnitario > 0)) throw new ErrorValidacion(`Ítem ${i + 1}: el valor unitario debe ser mayor a 0`);
    const unidad = UNIDADES.includes(it.unidad) ? it.unidad : "NIU";
    const valorVenta = it.valorVenta !== undefined ? r2(it.valorVenta) : r2(cantidad * valorUnitario);
    return {
      orden: i + 1, descripcion: descripcion.slice(0, 500), unidad, cantidad, valorUnitario,
      valorVenta, igv: r2(valorVenta * IGV_RATE), afectacionIgv: "10",
    };
  });
  const valorVenta = r2(lineas.reduce((a, it) => a + it.valorVenta, 0));
  const igv = r2(valorVenta * IGV_RATE);
  return { lineas, valorVenta, igv, total: r2(valorVenta + igv) };
}

// Valida y calcula todo lo que lleva un comprobante (ítems, totales, detracción
// y cuotas). Lanza ErrorValidacion con un mensaje para el usuario si algo no
// cumple las reglas de SUNAT.
// detraccionOpcion: undefined → automática (factura > monto mínimo, código por
// defecto); { aplicar: false } → sin detracción; { aplicar: true, codigo } → con
// el código elegido del catálogo.
// moneda USD requiere tipoCambio: los topes de S/ 700 se comparan en soles y la
// detracción se informa en soles; cuotas y neto van en dólares.
function prepararComprobante({ tipo, cliente, items, formaPago = "CONTADO", cuotas, detraccion: detraccionOpcion, moneda = "PEN", tipoCambio = null }) {
  if (!["FACTURA", "BOLETA"].includes(tipo)) throw new ErrorValidacion("tipo debe ser FACTURA o BOLETA");
  if (!MONEDAS.includes(moneda)) throw new ErrorValidacion("moneda debe ser PEN o USD");
  if (moneda === "USD" && !(tipoCambio > 0)) throw new ErrorValidacion("Falta el tipo de cambio para facturar en dólares");
  const { lineas, valorVenta, igv, total } = prepararLineas(items);
  const enSoles = (monto) => (moneda === "PEN" ? monto : r2(monto * tipoCambio));
  const sim = simbolo(moneda);

  let doc = documentoCliente(cliente.numDoc);
  if (tipo === "FACTURA" && doc?.tipo !== "6") {
    throw new ErrorValidacion(`La factura requiere RUC del cliente (documento actual: "${cliente.numDoc || ""}")`);
  }
  if (!doc) {
    // Boleta a cliente sin DNI/RUC válido: SUNAT lo permite solo por debajo de S/ 700.
    if (enSoles(total) >= 700) throw new ErrorValidacion("Boletas de S/ 700 o más requieren DNI o RUC del cliente");
    doc = { tipo: "0", numero: "-" };
  }
  const nombre = String(cliente.nombre || "").trim();
  if (!nombre) throw new ErrorValidacion("Falta el nombre o razón social del cliente");

  // Detracción: por defecto en facturas que superan el monto mínimo; quien
  // emite puede quitarla (p. ej. venta de bienes) o elegir otro código.
  const superaMinimo = tipo === "FACTURA" && enSoles(total) > detraccion.montoMinimo;
  const aplicar = detraccionOpcion?.aplicar ?? superaMinimo;
  let datosDetraccion = {};
  if (aplicar) {
    if (!superaMinimo) {
      throw new ErrorValidacion(`La detracción solo aplica a facturas de más de S/ ${detraccion.montoMinimo}`);
    }
    const codigo = detraccionOpcion?.codigo || detraccion.codigo;
    const delCatalogo = detraccion.codigos.find((d) => d.codigo === codigo);
    if (!delCatalogo) throw new ErrorValidacion(`Código de detracción no válido: ${codigo}`);
    if (!detraccion.cuenta) {
      throw new ErrorValidacion("La factura está sujeta a detracción pero falta EMISOR_CTA_DETRACCIONES en la configuración");
    }
    // El % por defecto del ERP puede venir del .env (DETRACCION_PORCENTAJE).
    const porcentaje = codigo === detraccion.codigo ? detraccion.porcentaje : delCatalogo.porcentaje;
    datosDetraccion = {
      detraccionCodigo: codigo,
      detraccionPorcentaje: porcentaje,
      detraccionMonto: r2(enSoles(total) * porcentaje / 100), // siempre en soles
      detraccionCuenta: detraccion.cuenta,
    };
  }
  const detraccionMoneda = datosDetraccion.detraccionMonto
    ? (moneda === "PEN" ? datosDetraccion.detraccionMonto : r2(total * datosDetraccion.detraccionPorcentaje / 100))
    : 0;
  const netoPendiente = r2(total - detraccionMoneda);

  // Crédito: las cuotas deben sumar el neto pendiente y vencer después de hoy.
  let cuotasFinal = null;
  const pago = tipo === "FACTURA" && formaPago === "CREDITO" ? "CREDITO" : "CONTADO";
  if (pago === "CREDITO") {
    const hoy = hoyLima();
    cuotasFinal = (cuotas?.length ? cuotas : [{ monto: netoPendiente, fechaVencimiento: sumarDias(hoy, 30) }])
      .map((q, i) => {
        const monto = r2(Number(q.monto));
        const fecha = String(q.fechaVencimiento || "").slice(0, 10);
        if (!(monto > 0)) throw new ErrorValidacion(`Cuota ${i + 1}: el monto debe ser mayor a 0`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha <= hoy) {
          throw new ErrorValidacion(`Cuota ${i + 1}: la fecha de vencimiento debe ser posterior a hoy`);
        }
        return { monto, fechaVencimiento: fecha };
      });
    const suma = r2(cuotasFinal.reduce((a, q) => a + q.monto, 0));
    if (Math.abs(suma - netoPendiente) > 0.009) {
      throw new ErrorValidacion(`Las cuotas suman ${sim} ${suma.toFixed(2)} y deben sumar el neto pendiente ${sim} ${netoPendiente.toFixed(2)}`);
    }
  }

  return {
    tipo,
    clienteTipoDoc: doc.tipo,
    clienteNumDoc: doc.numero,
    clienteNombre: nombre.slice(0, 300),
    clienteDireccion: cliente.direccion ? String(cliente.direccion).trim().slice(0, 300) : null,
    valorVenta, igv, total,
    moneda,
    tipoCambio: moneda === "USD" ? tipoCambio : null,
    formaPago: pago,
    cuotas: cuotasFinal,
    ...datosDetraccion,
    items: lineas,
  };
}

// Factura a RUC sin detracción y de más de S/ 700: si el cliente es agente de
// retención se marca (retendrá el 3%). Si Migo no responde no se bloquea.
async function marcarRetencion(datos) {
  const enSoles = datos.moneda === "PEN" ? datos.total : r2(datos.total * datos.tipoCambio);
  if (datos.tipo !== "FACTURA" || datos.clienteTipoDoc !== "6" || datos.detraccionMonto || enSoles <= 700) return datos;
  const r = await migo.consultarAgenteRetencion(datos.clienteNumDoc).catch(() => null);
  return { ...datos, agenteRetencion: !!r?.esAgente };
}

// Tipo de cambio del día para facturar en dólares (venta SUNAT vía Migo).
const tipoCambioDelDia = async (moneda) => (moneda === "USD" ? (await migo.tipoCambioVenta(hoyLima())).venta : null);

// Numera, guarda y envía. Devuelve el comprobante con la respuesta de SUNAT.
async function crearYEmitir(datos, extra) {
  const { items, ...cabecera } = datos;
  const serie = series[datos.tipo];
  const comprobante = await prisma.$transaction(async (tx) => {
    const correlativo = await siguienteCorrelativo(tx, serie, datos.tipo);
    return tx.comprobante.create({
      data: { ...cabecera, ...extra, serie, correlativo, items: { create: items } },
    });
  });
  return sinArchivos(await emitir(comprobante.id));
}

function responderError(res, error, contexto) {
  if (error instanceof ErrorValidacion) return res.status(error.status).json({ message: error.message });
  if (error instanceof migo.ErrorMigo) return res.status(error.status || 502).json({ message: error.message });
  // Errores de servicios externos (correo) que ya traen status y un mensaje para el usuario.
  if (Number.isInteger(error.status) && error.status >= 400) return res.status(error.status).json({ message: error.message });
  console.error(`❌ Error ${contexto}:`, error);
  res.status(500).json({ message: `Error ${contexto}`, error: error.message });
}

/* =========================
   COTIZACIÓN → COMPROBANTE
========================= */
const fechaCorta = (d) =>
  new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
const numeroCorto = (n) => String(Number(Number(n).toFixed(2)));

// Descripción para SUNAT de un ítem de cotización: nombre + material +
// medidas + adicionales elegidos + glosa, y para paneles el código/ubicación y
// el periodo de la reserva vinculada a la cotización.
function descripcionItem(it, reservas) {
  const p = it.producto;
  const panel = it.panel;
  const detallePanel = panel ? [panel.codigo, panel.nombre || panel.ubicacion].filter(Boolean).join(" ") : null;
  const nombre = it.nombre || p?.nombre || p?.servicio || p?.material || detallePanel || "Servicio";
  const partes = [nombre];

  const contiene = (texto) => nombre.toLowerCase().includes(String(texto).toLowerCase());
  if (p?.material && !contiene(p.material)) partes.push(p.material);
  if (panel) {
    if (!contiene(panel.codigo)) partes.push(`Panel ${detallePanel}`);
    else if (panel.ubicacion && !contiene(panel.ubicacion)) partes.push(panel.ubicacion);
    else if (panel.nombre && !contiene(panel.nombre)) partes.push(panel.nombre);
  }

  // La unidad del catálogo solo se agrega si es de longitud/área (m, m², ml).
  const unidad = /^(m|m2|m²|ml|mts?)$/i.test(p?.unidad || "") ? ` ${p.unidad}` : "";
  if (it.medidaAncho && it.medidaAlto) partes.push(`${numeroCorto(it.medidaAncho)} x ${numeroCorto(it.medidaAlto)}${unidad}`);
  else if (it.medida && it.medida !== 1) partes.push(`${numeroCorto(it.medida)}${unidad}`);

  const adicionales = (it.adicionales || []).filter((a) => a.seleccionado).map((a) => a.adicional?.nombre).filter(Boolean);
  if (adicionales.length) partes.push(`con ${adicionales.join(", ")}`);

  if (it.descripcion) partes.push(it.descripcion);

  // Periodo de la reserva solo para el alquiler (producción e instalación son de una vez).
  if (panel && !/^(producción|produccion|instalación|instalacion)/i.test(nombre)) {
    const reserva = reservas.find((r) => r.panelId === panel.id && r.activo);
    if (reserva) partes.push(`del ${fechaCorta(reserva.fechaInicio)} al ${fechaCorta(reserva.fechaFin)}`);
  }
  return partes.join(" - ");
}

function itemsDesdeCotizacion(cot) {
  return cot.items.map((it) => ({
    cantidad: it.cantidad,
    unidad: it.panelId ? "ZZ" : "NIU",
    descripcion: descripcionItem(it, cot.reservas),
    valorUnitario: it.precio,
  }));
}

// Cotización lista para facturar: aprobada (o facturada sin comprobante
// vigente) y sin otro comprobante vigente. Uno rechazado no cuenta, y uno
// anulado con nota de crédito aceptada tampoco.
async function cargarCotizacionFacturable(cotizacionId) {
  const cot = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: {
      cliente: true,
      reservas: true,
      items: {
        include: { producto: true, panel: true, adicionales: { include: { adicional: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!cot) throw new ErrorValidacion("Cotización no encontrada", 404);
  if (!["APROBADA", "FACTURADA"].includes(cot.estado)) {
    throw new ErrorValidacion("Solo se emite comprobante de una cotización aprobada o facturada");
  }
  if (cot.items.length === 0) throw new ErrorValidacion("La cotización no tiene ítems");

  const vigente = await prisma.comprobante.findFirst({
    where: {
      cotizacionId,
      tipo: { in: ["FACTURA", "BOLETA"] },
      estado: { not: "RECHAZADO" },
      notasCredito: { none: { estado: "ACEPTADO", tipo: "NOTA_CREDITO", motivoCodigo: { in: MOTIVOS_NC_TOTAL } } },
    },
  });
  if (vigente) {
    throw new ErrorValidacion(
      `La cotización ya tiene el comprobante ${numeroDocumento(vigente.serie, vigente.correlativo)} (${vigente.estado})`, 409
    );
  }
  return cot;
}

// Con el comprobante aceptado, la cotización aprobada pasa a FACTURADA (mismo
// efecto que el botón "Facturar", que ya no hace falta pulsar aparte).
async function marcarCotizacionFacturada(cotizacionId, usuarioId, comprobante) {
  const { count } = await prisma.cotizacion.updateMany({
    where: { id: cotizacionId, estado: "APROBADA" },
    data: { estado: "FACTURADA", facturadaAt: new Date() },
  });
  if (count === 0) return;
  await prisma.cotizacionLog.create({
    data: {
      cotizacionId, usuarioId,
      estadoAnterior: "APROBADA", estadoNuevo: "FACTURADA",
      comentario: `Comprobante electrónico ${comprobante.numero}`,
    },
  });
}

// GET /cotizacion/:id/borrador — datos para prellenar el formulario de emisión.
exports.borradorDesdeCotizacion = async (req, res) => {
  try {
    const cot = await cargarCotizacionFacturable(Number(req.params.id));
    const doc = documentoCliente(cot.cliente.documento);
    const retencion = doc?.tipo === "6" ? await migo.consultarAgenteRetencion(doc.numero).catch(() => null) : null;
    res.json({
      agenteRetencion: retencion?.esAgente ?? null,
      cotizacion: { id: cot.id, numero: cot.numero, total: cot.total, conIgv: cot.conIgv },
      // Condición de pago pactada en la cotización (precarga contado/crédito)
      condicion: { condicionPago: cot.condicionPago, diasCredito: cot.diasCredito },
      tipoSugerido: doc?.tipo === "6" ? "FACTURA" : "BOLETA",
      puedeFactura: doc?.tipo === "6",
      cliente: { numDoc: cot.cliente.documento, nombre: cot.cliente.nombreComercial, direccion: cot.cliente.direccion || "" },
      items: itemsDesdeCotizacion(cot),
    });
  } catch (error) {
    responderError(res, error, "preparando comprobante desde cotización");
  }
};

// POST /desde-cotizacion — emite en un paso con los ítems tal cual (sin revisar).
exports.emitirDesdeCotizacion = async (req, res) => {
  try {
    if (configIncompleta(res)) return;
    const cotizacionId = Number(req.body.cotizacionId);
    const cot = await cargarCotizacionFacturable(cotizacionId);
    const moneda = req.body.moneda || "PEN";
    const datos = await marcarRetencion(prepararComprobante({
      tipo: req.body.tipo,
      formaPago: req.body.formaPago,
      cuotas: req.body.cuotas,
      detraccion: req.body.detraccion,
      moneda,
      tipoCambio: await tipoCambioDelDia(moneda),
      cliente: { numDoc: cot.cliente.documento, nombre: cot.cliente.nombreComercial, direccion: cot.cliente.direccion },
      items: itemsDesdeCotizacion(cot),
    }));

    const emitido = await crearYEmitir(datos, { cotizacionId, clienteId: cot.clienteId, usuarioId: req.user.id });
    if (emitido.estado === "ACEPTADO") await marcarCotizacionFacturada(cotizacionId, req.user.id, emitido);
    res.status(201).json(emitido);
  } catch (error) {
    responderError(res, error, "emitiendo comprobante");
  }
};

/* =========================
   EMITIR FACTURA/BOLETA (ítems libres o revisados desde una cotización)
   body: { tipo, cliente: { numDoc, nombre, direccion }, items: [{ descripcion, unidad, cantidad, valorUnitario }],
           formaPago: "CONTADO"|"CREDITO", cuotas?: [{ monto, fechaVencimiento }],
           detraccion?: { aplicar, codigo }, moneda?: "PEN"|"USD", observacion?, cotizacionId? }
========================= */
exports.emitirManual = async (req, res) => {
  try {
    if (configIncompleta(res)) return;
    const { tipo, cliente = {}, items, formaPago, cuotas, detraccion: detraccionOpcion, observacion, moneda = "PEN" } = req.body;
    const cotizacionId = req.body.cotizacionId ? Number(req.body.cotizacionId) : null;
    const cot = cotizacionId ? await cargarCotizacionFacturable(cotizacionId) : null;
    const datos = await marcarRetencion(prepararComprobante({
      tipo, cliente, items, formaPago, cuotas, detraccion: detraccionOpcion,
      moneda, tipoCambio: await tipoCambioDelDia(moneda),
    }));

    // Si el cliente ya existe en el ERP se vincula (para reportes por cliente).
    const existente = cot || datos.clienteNumDoc === "-"
      ? null
      : await prisma.cliente.findUnique({ where: { documento: datos.clienteNumDoc }, select: { id: true } });

    const emitido = await crearYEmitir(datos, {
      cotizacionId,
      clienteId: cot?.clienteId ?? existente?.id ?? null,
      usuarioId: req.user.id,
      observacion: observacion ? String(observacion).trim().slice(0, 500) || null : null,
    });
    if (cot && emitido.estado === "ACEPTADO") await marcarCotizacionFacturada(cotizacionId, req.user.id, emitido);
    res.status(201).json(emitido);
  } catch (error) {
    responderError(res, error, "emitiendo comprobante");
  }
};

// GET /opciones — catálogos para el formulario (detracción, unidades).
exports.opciones = (req, res) => {
  res.json({
    detraccion: {
      montoMinimo: detraccion.montoMinimo,
      codigoPorDefecto: detraccion.codigo,
      codigos: detraccion.codigos.map((d) =>
        d.codigo === detraccion.codigo ? { ...d, porcentaje: detraccion.porcentaje } : d
      ),
    },
    unidades: UNIDADES,
    monedas: MONEDAS,
    motivosNota: MOTIVOS_NOTA,
    motivosNotaCreditoTotal: MOTIVOS_NC_TOTAL,
    retencionPorcentaje: RETENCION_PORCENTAJE,
  });
};

// GET /tipo-cambio — venta SUNAT del día (para la vista previa en dólares).
exports.tipoCambio = async (req, res) => {
  try {
    res.json(await migo.tipoCambioVenta(hoyLima()));
  } catch (error) {
    responderError(res, error, "consultando tipo de cambio");
  }
};

/* =========================
   CONSULTA DE RUC/DNI (Migo) para autocompletar el receptor
========================= */
exports.consultarDocumento = async (req, res) => {
  const doc = String(req.params.documento || "").trim();
  try {
    // Si ya es cliente del ERP se devuelve su condición de pago por defecto.
    const condicion = await prisma.cliente.findUnique({
      where: { documento: doc }, select: { condicionPago: true, diasCredito: true },
    });
    if (/^\d{11}$/.test(doc)) {
      const [ruc, retencion] = await Promise.all([migo.consultarRuc(doc), migo.consultarAgenteRetencion(doc)]);
      return res.json({ ...ruc, agenteRetencion: retencion?.esAgente ?? null, condicion });
    }
    if (/^\d{8}$/.test(doc)) return res.json({ ...(await migo.consultarDni(doc)), condicion });
    res.status(400).json({ message: "Ingresa un RUC de 11 dígitos o un DNI de 8" });
  } catch (error) {
    responderError(res, error, "consultando documento");
  }
};

/* =========================
   VERIFICAR VALIDEZ EN SUNAT (Migo, consulta integrada de comprobantes)
========================= */
exports.verificarEnSunat = async (req, res) => {
  try {
    const c = await prisma.comprobante.findUnique({ where: { id: Number(req.params.id) } });
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });

    const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" })
      .format(new Date(c.fechaEmision)).split("-");
    const resultado = await migo.validarComprobante({
      rucEmisor: emisor.ruc,
      tipoComprobante: CODIGO_TIPO[c.tipo],
      serie: c.serie,
      numero: c.correlativo,
      fechaEmision: `${dia}-${mes}-${anio}`,
      monto: c.total,
    });

    const actualizado = await prisma.comprobante.update({
      where: { id: c.id },
      data: { validacionSunat: resultado, validadoAt: new Date() },
      select: SELECT_RESUMEN,
    });
    res.json(conNumero(actualizado));
  } catch (error) {
    responderError(res, error, "verificando comprobante en SUNAT");
  }
};

/* =========================
   NOTAS DE CRÉDITO Y DÉBITO
   body: { motivoCodigo, motivoDescripcion?, items? }
   Motivos totales (NC 01/02/06) copian los ítems del comprobante; los demás
   requieren los ítems de la nota (lo devuelto, el descuento o el cargo).
========================= */
exports.emitirNota = (tipoNota) => async (req, res) => {
  try {
    if (configIncompleta(res)) return;
    const nombreNota = tipoNota === "NOTA_CREDITO" ? "nota de crédito" : "nota de débito";
    const motivos = MOTIVOS_NOTA[tipoNota];
    const motivoCodigo = req.body.motivoCodigo || (tipoNota === "NOTA_CREDITO" ? "01" : "02");
    if (!motivos[motivoCodigo]) {
      throw new ErrorValidacion(`motivoCodigo debe ser uno de: ${Object.keys(motivos).join(", ")}`);
    }
    const motivoDescripcion = String(req.body.motivoDescripcion || motivos[motivoCodigo]).trim().slice(0, 250);

    const referenciaId = Number(req.params.id);
    const ref = await prisma.comprobante.findUnique({
      where: { id: referenciaId },
      include: { items: true, notasCredito: { where: { estado: { not: "RECHAZADO" } } } },
    });
    if (!ref) throw new ErrorValidacion("Comprobante no encontrado", 404);
    if (!["FACTURA", "BOLETA"].includes(ref.tipo)) throw new ErrorValidacion(`Solo se emite ${nombreNota} sobre facturas o boletas`);
    if (ref.estado !== "ACEPTADO") throw new ErrorValidacion("El comprobante debe estar aceptado por SUNAT");
    if (ref.origen === "EXTERNO") {
      throw new ErrorValidacion(`${numeroDocumento(ref.serie, ref.correlativo)} se emitió fuera del ERP: emite la ${nombreNota} en el portal SOL`);
    }
    if (ref.notasCredito.some((n) => esNotaTotal(n.tipo, n.motivoCodigo))) {
      throw new ErrorValidacion("El comprobante ya está anulado con una nota de crédito", 409);
    }

    let lineas, valorVenta, igv, total;
    if (esNotaTotal(tipoNota, motivoCodigo)) {
      if (ref.notasCredito.some((n) => n.tipo === "NOTA_CREDITO")) {
        throw new ErrorValidacion("El comprobante ya tiene notas de crédito parciales: usa otra nota parcial por el saldo", 409);
      }
      lineas = ref.items.map(({ id, comprobanteId, ...it }) => it);
      ({ valorVenta, igv, total } = ref);
    } else {
      ({ lineas, valorVenta, igv, total } = prepararLineas(req.body.items));
      if (tipoNota === "NOTA_CREDITO") {
        // Lo acreditado (sumando notas previas no rechazadas) no puede superar el comprobante.
        const yaAcreditado = r2(ref.notasCredito.filter((n) => n.tipo === "NOTA_CREDITO").reduce((a, n) => a + n.total, 0));
        const disponible = r2(ref.total - yaAcreditado);
        if (total > disponible + TOLERANCIA) {
          throw new ErrorValidacion(`La nota (${simbolo(ref.moneda)} ${total.toFixed(2)}) supera lo que queda por acreditar: ${simbolo(ref.moneda)} ${disponible.toFixed(2)}`);
        }
      }
    }

    const sufijo = ref.tipo === "FACTURA" ? "FACTURA" : "BOLETA";
    const serie = series[`${tipoNota}_${sufijo}`];
    const nota = await prisma.$transaction(async (tx) => {
      const correlativo = await siguienteCorrelativo(tx, serie, tipoNota);
      return tx.comprobante.create({
        data: {
          tipo: tipoNota, serie, correlativo,
          moneda: ref.moneda, tipoCambio: ref.tipoCambio,
          clienteTipoDoc: ref.clienteTipoDoc,
          clienteNumDoc: ref.clienteNumDoc,
          clienteNombre: ref.clienteNombre,
          clienteDireccion: ref.clienteDireccion,
          valorVenta, igv, total,
          referenciaId, motivoCodigo, motivoDescripcion,
          cotizacionId: ref.cotizacionId, clienteId: ref.clienteId, usuarioId: req.user.id,
          items: { create: lineas },
        },
      });
    });

    res.status(201).json(sinArchivos(await emitir(nota.id)));
  } catch (error) {
    responderError(res, error, "emitiendo nota");
  }
};

/* =========================
   REINTENTAR ENVÍO (solo si falló la comunicación con el PSE)
========================= */
exports.reenviar = async (req, res) => {
  try {
    if (configIncompleta(res)) return;
    const id = Number(req.params.id);
    const c = await prisma.comprobante.findUnique({ where: { id }, select: { estado: true } });
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });
    if (!["ERROR", "PENDIENTE"].includes(c.estado)) {
      return res.status(400).json({ message: `No se puede reenviar un comprobante ${c.estado}` });
    }
    res.json(sinArchivos(await emitir(id)));
  } catch (error) {
    console.error("❌ Error reenviando comprobante:", error);
    res.status(500).json({ message: "Error reenviando comprobante", error: error.message });
  }
};

/* =========================
   CONSULTAS
========================= */
exports.listar = async (req, res) => {
  try {
    const { estado, tipo, cotizacionId } = req.query;
    const comprobantes = await prisma.comprobante.findMany({
      where: {
        ...(estado && { estado }),
        ...(tipo && { tipo }),
        ...(cotizacionId && { cotizacionId: Number(cotizacionId) }),
      },
      select: SELECT_CON_COBRO,
      orderBy: { id: "desc" },
      take: 200,
    });
    // Qué filas tienen XML/CDR, sin cargar su contenido (decenas de KB por fila).
    const ids = comprobantes.map((c) => c.id);
    const [conXml, conCdr] = await Promise.all(["xmlFirmado", "cdrXml"].map((campo) =>
      prisma.comprobante.findMany({ where: { id: { in: ids }, [campo]: { not: null } }, select: { id: true } })
        .then((filas) => new Set(filas.map((f) => f.id)))));
    res.json(comprobantes.map((c) => ({ ...conCobro(c), tieneXml: conXml.has(c.id), tieneCdr: conCdr.has(c.id) })));
  } catch (error) {
    console.error("❌ Error listando comprobantes:", error);
    res.status(500).json({ message: "Error listando comprobantes", error: error.message });
  }
};

exports.obtener = async (req, res) => {
  try {
    const c = await prisma.comprobante.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        items: { orderBy: { orden: "asc" } },
        referencia: { select: SELECT_RESUMEN },
        notasCredito: { select: SELECT_RESUMEN },
      },
    });
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });
    res.json({
      ...sinArchivos(c),
      referencia: conNumero(c.referencia),
      notasCredito: c.notasCredito.map(conNumero),
    });
  } catch (error) {
    console.error("❌ Error obteniendo comprobante:", error);
    res.status(500).json({ message: "Error obteniendo comprobante", error: error.message });
  }
};

// GET /:id/xml y /:id/cdr — descarga del XML firmado o de la constancia de SUNAT.
exports.descargarArchivo = (campo, prefijo) => async (req, res) => {
  try {
    const c = await prisma.comprobante.findUnique({ where: { id: Number(req.params.id) } });
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });
    if (!c[campo]) return res.status(404).json({ message: "El comprobante aún no tiene ese archivo" });
    const nombre = `${prefijo}${nombreArchivo(emisor.ruc, c.tipo, c.serie, c.correlativo)}.xml`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(c[campo]);
  } catch (error) {
    console.error("❌ Error descargando archivo del comprobante:", error);
    res.status(500).json({ message: "Error descargando archivo", error: error.message });
  }
};

/* =========================
   COBROS (cuentas por cobrar)
========================= */
const SELECT_ADJUNTO = { id: true, nombre: true, tipo: true, tamano: true };
async function cargarConPagos(id) {
  return prisma.comprobante.findUnique({
    where: { id },
    select: {
      ...SELECT_RESUMEN,
      pagos: {
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
        include: { usuario: { select: { nombre: true } }, adjuntos: { select: SELECT_ADJUNTO, orderBy: { id: "asc" } } },
      },
      notasCredito: NOTAS_ACEPTADAS,
    },
  });
}

const respuestaPagos = ({ pagos, notasCredito, ...c }) => ({
  comprobante: conNumero(c),
  cobro: resumenCobro(c, pagos, notasCredito),
  pagos,
});

exports.listarPagos = async (req, res) => {
  try {
    const c = await cargarConPagos(Number(req.params.id));
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });
    res.json(respuestaPagos(c));
  } catch (error) {
    responderError(res, error, "listando pagos");
  }
};

// body: { tipo: "COBRO"|"DETRACCION", fecha: "aaaa-mm-dd", monto, medio, numeroOperacion?, nota? }
exports.registrarPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await cargarConPagos(id);
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });
    const cobro = resumenCobro(c, c.pagos, c.notasCredito);
    if (!cobro) throw new ErrorValidacion("Solo se registran pagos de facturas o boletas aceptadas por SUNAT");
    if (cobro.estado === "ANULADO") throw new ErrorValidacion("El comprobante está anulado con nota de crédito");

    const tipo = req.body.tipo || "COBRO";
    const monto = r2(Number(req.body.monto));
    const fecha = String(req.body.fecha || "").slice(0, 10);
    const medio = req.body.medio;
    if (!TIPOS_PAGO.includes(tipo)) throw new ErrorValidacion(`tipo debe ser uno de: ${TIPOS_PAGO.join(", ")}`);
    if (!MEDIOS_PAGO.includes(medio)) throw new ErrorValidacion(`medio debe ser uno de: ${MEDIOS_PAGO.join(", ")}`);
    if (!(monto > 0)) throw new ErrorValidacion("El monto debe ser mayor a 0");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyLima()) throw new ErrorValidacion("Indica una fecha de pago válida (no futura)");

    // Cobro y retención descuentan del saldo del cliente (moneda del comprobante);
    // la detracción, de lo que falta depositar (siempre en soles).
    const pendiente = tipo === "DETRACCION" ? cobro.saldoDetraccion : cobro.saldo;
    const sim = tipo === "DETRACCION" ? "S/" : simbolo(c.moneda);
    if (monto > pendiente + TOLERANCIA) {
      throw new ErrorValidacion(
        `El monto supera lo pendiente${tipo === "DETRACCION" ? " de detracción" : ""}: ${sim} ${pendiente.toFixed(2)}`
      );
    }

    // Constancia opcional (voucher o constancia de detracción): se sube antes y,
    // si el pago no llega a guardarse, se borra del bucket.
    const adjunto = req.file ? await almacenamiento.subir(`cobros/${id}`, req.file) : null;
    try {
      await prisma.pagoComprobante.create({
        data: {
          comprobanteId: id, tipo, monto, medio,
          fecha: new Date(`${fecha}T12:00:00-05:00`),
          numeroOperacion: req.body.numeroOperacion ? String(req.body.numeroOperacion).trim().slice(0, 60) || null : null,
          nota: req.body.nota ? String(req.body.nota).trim().slice(0, 300) || null : null,
          usuarioId: req.user.id,
          ...(adjunto && { adjuntos: { create: { ...adjunto, usuarioId: req.user.id } } }),
        },
      });
    } catch (error) {
      if (adjunto) await almacenamiento.borrar([adjunto.ruta]);
      throw error;
    }
    res.status(201).json(respuestaPagos(await cargarConPagos(id)));
  } catch (error) {
    responderError(res, error, "registrando pago");
  }
};

exports.eliminarPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const where = { id: Number(req.params.pagoId), comprobanteId: id };
    const adjuntos = await prisma.adjuntoPago.findMany({ where: { pagoComprobante: where }, select: { ruta: true } });
    const { count } = await prisma.pagoComprobante.deleteMany({ where });
    if (count === 0) return res.status(404).json({ message: "Pago no encontrado" });
    await almacenamiento.borrar(adjuntos.map((a) => a.ruta));
    res.json(respuestaPagos(await cargarConPagos(id)));
  } catch (error) {
    responderError(res, error, "eliminando pago");
  }
};

// POST /:id/pagos/:pagoId/adjuntos (multipart "archivo") — constancia de un cobro ya registrado.
exports.agregarAdjuntoPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pagoId = Number(req.params.pagoId);
    if (!req.file) throw new ErrorValidacion("Adjunta una imagen o PDF");
    const pago = await prisma.pagoComprobante.findFirst({ where: { id: pagoId, comprobanteId: id }, select: { id: true } });
    if (!pago) throw new ErrorValidacion("Pago no encontrado", 404);
    const adjunto = await almacenamiento.subir(`cobros/${id}`, req.file);
    try {
      await prisma.adjuntoPago.create({ data: { ...adjunto, pagoComprobanteId: pagoId, usuarioId: req.user.id } });
    } catch (error) {
      await almacenamiento.borrar([adjunto.ruta]);
      throw error;
    }
    res.status(201).json(respuestaPagos(await cargarConPagos(id)));
  } catch (error) {
    responderError(res, error, "adjuntando constancia");
  }
};

// DELETE /:id/pagos/:pagoId/adjuntos/:adjuntoId
exports.eliminarAdjuntoPago = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const a = await prisma.adjuntoPago.findFirst({
      where: { id: Number(req.params.adjuntoId), pagoComprobante: { id: Number(req.params.pagoId), comprobanteId: id } },
    });
    if (!a) throw new ErrorValidacion("Adjunto no encontrado", 404);
    await prisma.adjuntoPago.delete({ where: { id: a.id } });
    await almacenamiento.borrar([a.ruta]);
    res.json(respuestaPagos(await cargarConPagos(id)));
  } catch (error) {
    responderError(res, error, "eliminando constancia");
  }
};

// GET /:id/pagos/:pagoId/adjuntos/:adjuntoId → { url } firmada por 10 minutos.
exports.urlAdjuntoPago = async (req, res) => {
  try {
    const a = await prisma.adjuntoPago.findFirst({
      where: { id: Number(req.params.adjuntoId), pagoComprobante: { id: Number(req.params.pagoId), comprobanteId: Number(req.params.id) } },
    });
    if (!a) throw new ErrorValidacion("Adjunto no encontrado", 404);
    res.json({ url: await almacenamiento.urlFirmada(a.ruta), nombre: a.nombre, tipo: a.tipo });
  } catch (error) {
    responderError(res, error, "abriendo constancia");
  }
};

/* =========================
   PDF (representación impresa) Y ENVÍO POR CORREO
========================= */
async function generarPdf(c) {
  // QR según SUNAT: RUC|tipo|serie|número|IGV|total|fecha|tipo doc. cliente|n° doc. cliente|hash|
  const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" })
    .format(new Date(c.fechaEmision)).split("-");
  const qr = [
    emisor.ruc, CODIGO_TIPO[c.tipo], c.serie, c.correlativo, c.igv.toFixed(2), c.total.toFixed(2),
    `${anio}-${mes}-${dia}`, c.clienteTipoDoc, c.clienteNumDoc, c.hash || "",
  ].join("|") + "|";

  return htmlAPdf(comprobantePdfTemplate({
    comprobante: c,
    emisor,
    qrDataUrl: await QRCode.toDataURL(qr, { margin: 0, width: 200 }),
    detraccionDescripcion: detraccion.codigos.find((d) => d.codigo === c.detraccionCodigo)?.descripcion,
    retencionPorcentaje: RETENCION_PORCENTAJE,
  }));
}

exports.pdf = async (req, res) => {
  try {
    const c = await prisma.comprobante.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: true, referencia: true },
    });
    if (!c) return res.status(404).json({ message: "Comprobante no encontrado" });
    if (c.origen === "EXTERNO") throw new ErrorValidacion("El PDF de un comprobante emitido fuera del ERP se descarga del portal SOL");
    const pdf = await generarPdf(c);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${nombreArchivo(emisor.ruc, c.tipo, c.serie, c.correlativo)}.pdf`,
    });
    res.send(pdf);
  } catch (error) {
    responderError(res, error, "generando PDF del comprobante");
  }
};

// POST /:id/enviar-correo  body: { para } — PDF, XML firmado y CDR adjuntos.
exports.enviarCorreo = async (req, res) => {
  try {
    const c = await prisma.comprobante.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: true, referencia: true, cliente: { select: { email: true } } },
    });
    if (!c) throw new ErrorValidacion("Comprobante no encontrado", 404);
    if (c.estado !== "ACEPTADO") throw new ErrorValidacion("Solo se envían comprobantes aceptados por SUNAT");
    if (c.origen === "EXTERNO") throw new ErrorValidacion("Un comprobante emitido fuera del ERP se envía desde el portal SOL");

    const para = String(req.body.para || c.cliente?.email || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    if (para.length === 0) throw new ErrorValidacion("Indica el correo del cliente");
    if (para.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) throw new ErrorValidacion("Hay un correo con formato inválido");

    const base = nombreArchivo(emisor.ruc, c.tipo, c.serie, c.correlativo);
    await enviarComprobantePorCorreo({
      para,
      comprobante: { ...c, numero: numeroDocumento(c.serie, c.correlativo) },
      emisor,
      adjuntos: [
        { nombre: `${base}.pdf`, tipo: "application/pdf", contenido: await generarPdf(c) },
        c.xmlFirmado && { nombre: `${base}.xml`, tipo: "application/xml", contenido: Buffer.from(c.xmlFirmado, "utf8") },
        c.cdrXml && { nombre: `R-${base}.xml`, tipo: "application/xml", contenido: Buffer.from(c.cdrXml, "utf8") },
      ].filter(Boolean),
    });

    const actualizado = await prisma.comprobante.update({
      where: { id: c.id },
      data: { correoEnviadoA: para.join(", "), correoEnviadoAt: new Date() },
      select: SELECT_RESUMEN,
    });
    res.json(conNumero(actualizado));
  } catch (error) {
    responderError(res, error, "enviando comprobante por correo");
  }
};

/* =========================
   COMPROBANTES EMITIDOS FUERA DEL ERP (portal SOL)
   Se registran solo para cobrarlos: no se envían a SUNAT, no tienen XML/CDR
   y quedan como ACEPTADO con origen EXTERNO.
========================= */
const XLSX = require("xlsx");

const SERIES_ERP = new Set(Object.values(series));

// Fecha aaaa-mm-dd desde "dd/mm/aaaa", "aaaa-mm-dd" o una fecha de Excel.
function leerFecha(valor) {
  if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 10);
  if (typeof valor === "number") return XLSX.SSF.format("yyyy-mm-dd", valor);
  const t = String(valor ?? "").trim();
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Valida un comprobante externo y devuelve { datos, cobrado, numero } listo para crear.
// body: { tipo, serie, correlativo, fechaEmision, cliente: { numDoc, nombre, direccion? }, moneda, tipoCambio?,
//         total, detraccionPorcentaje?, agenteRetencion?, formaPago, cuotas? | diasCredito? | fechaVencimiento?,
//         cobrado?, observacion? }
async function prepararExterno(body) {
  const tipo = String(body.tipo || "FACTURA").toUpperCase();
  if (!["FACTURA", "BOLETA"].includes(tipo)) throw new ErrorValidacion("tipo debe ser FACTURA o BOLETA");
  const serie = String(body.serie || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(serie)) throw new ErrorValidacion("La serie debe tener 4 caracteres (ej. E001)");
  if (SERIES_ERP.has(serie)) throw new ErrorValidacion(`La serie ${serie} la usa el ERP: no se registra como externa`);
  const correlativo = Number(body.correlativo);
  if (!Number.isInteger(correlativo) || correlativo < 1 || correlativo > 99999999) {
    throw new ErrorValidacion("El número del comprobante debe ser un entero entre 1 y 99999999");
  }
  const fecha = leerFecha(body.fechaEmision);
  if (!fecha || fecha > hoyLima()) throw new ErrorValidacion("Indica una fecha de emisión válida (no futura)");

  const moneda = String(body.moneda || "PEN").toUpperCase();
  if (!MONEDAS.includes(moneda)) throw new ErrorValidacion("moneda debe ser PEN o USD");
  const total = r2(Number(body.total));
  if (!(total > 0)) throw new ErrorValidacion("El total debe ser mayor a 0");
  const tipoCambio = moneda === "USD"
    ? Number(body.tipoCambio) || (await migo.tipoCambioVenta(fecha)).venta
    : null;

  const doc = documentoCliente(body.cliente?.numDoc);
  if (tipo === "FACTURA" && doc?.tipo !== "6") throw new ErrorValidacion("La factura requiere el RUC del cliente");
  const nombre = String(body.cliente?.nombre || "").trim();
  if (!nombre) throw new ErrorValidacion("Falta el nombre o razón social del cliente");

  const valorVenta = r2(total / (1 + IGV_RATE));
  const pct = Number(body.detraccionPorcentaje) || 0;
  if (pct < 0 || pct > 100) throw new ErrorValidacion("El % de detracción no es válido");
  const enSoles = moneda === "PEN" ? total : r2(total * tipoCambio);
  const detraccionMonto = pct > 0 ? r2(enSoles * pct / 100) : null;
  const neto = r2(total - (pct > 0 ? r2(total * pct / 100) : 0));

  // Crédito: cuotas explícitas o una sola a N días; las fechas pueden ser pasadas.
  const formaPago = tipo === "FACTURA" && String(body.formaPago || "").toUpperCase() === "CREDITO" ? "CREDITO" : "CONTADO";
  let cuotas = null;
  if (formaPago === "CREDITO") {
    const lista = Array.isArray(body.cuotas) && body.cuotas.length
      ? body.cuotas
      : [{ monto: neto, fechaVencimiento: leerFecha(body.fechaVencimiento) || sumarDias(fecha, Number(body.diasCredito) || 30) }];
    cuotas = lista.map((q, i) => {
      const monto = r2(Number(q.monto));
      const venc = leerFecha(q.fechaVencimiento);
      if (!(monto > 0)) throw new ErrorValidacion(`Cuota ${i + 1}: el monto debe ser mayor a 0`);
      if (!venc || venc < fecha) throw new ErrorValidacion(`Cuota ${i + 1}: el vencimiento debe ser igual o posterior a la emisión`);
      return { monto, fechaVencimiento: venc };
    });
    const suma = r2(cuotas.reduce((a, q) => a + q.monto, 0));
    if (Math.abs(suma - neto) > TOLERANCIA) {
      throw new ErrorValidacion(`Las cuotas suman ${simbolo(moneda)} ${suma.toFixed(2)} y deben sumar el neto ${simbolo(moneda)} ${neto.toFixed(2)}`);
    }
  }

  const cobrado = r2(Number(body.cobrado) || 0);
  if (cobrado < 0 || cobrado > neto + TOLERANCIA) {
    throw new ErrorValidacion(`Lo cobrado no puede superar el neto ${simbolo(moneda)} ${neto.toFixed(2)}`);
  }

  const numero = numeroDocumento(serie, correlativo);
  const igv = r2(total - valorVenta);
  const datos = {
    tipo, serie, correlativo, origen: "EXTERNO", estado: "ACEPTADO",
    sunatMensaje: "Emitido fuera del ERP (portal SOL)",
    fechaEmision: new Date(`${fecha}T12:00:00-05:00`),
    moneda, tipoCambio,
    clienteTipoDoc: doc?.tipo ?? "0", clienteNumDoc: doc?.numero ?? "-",
    clienteNombre: nombre.slice(0, 300),
    clienteDireccion: body.cliente?.direccion ? String(body.cliente.direccion).trim().slice(0, 300) : null,
    valorVenta, igv, total,
    formaPago, cuotas,
    ...(detraccionMonto && { detraccionPorcentaje: pct, detraccionMonto }),
    agenteRetencion: !!body.agenteRetencion,
    observacion: body.observacion ? String(body.observacion).trim().slice(0, 500) || null : null,
    items: [{
      orden: 1, descripcion: `Según comprobante ${numero} emitido en el portal SOL`, unidad: "ZZ",
      cantidad: 1, valorUnitario: valorVenta, valorVenta, igv, afectacionIgv: "10",
    }],
  };
  return { datos, cobrado, numero };
}

// Crea el comprobante externo (y el cobro previo, si se indicó lo ya cobrado).
async function crearExterno({ datos, cobrado, numero }, { usuarioId, cotizacion = null }) {
  const { items, ...cabecera } = datos;
  const existente = datos.clienteNumDoc === "-" ? null
    : await prisma.cliente.findUnique({ where: { documento: datos.clienteNumDoc }, select: { id: true } });
  try {
    return await prisma.comprobante.create({
      data: {
        ...cabecera,
        usuarioId,
        cotizacionId: cotizacion?.id ?? null,
        clienteId: cotizacion?.clienteId ?? existente?.id ?? null,
        items: { create: items },
        ...(cobrado > 0 && {
          pagos: {
            create: { tipo: "COBRO", monto: cobrado, medio: "OTRO", fecha: new Date(), nota: "Cobrado antes de registrarlo en el ERP", usuarioId },
          },
        }),
      },
      select: SELECT_RESUMEN,
    });
  } catch (error) {
    if (error.code === "P2002") throw new ErrorValidacion(`El comprobante ${numero} ya está registrado`, 409);
    throw error;
  }
}

// POST /externos — registra uno. Con cotizacionId la cotización pasa a FACTURADA.
exports.registrarExterno = async (req, res) => {
  try {
    const cotizacionId = req.body.cotizacionId ? Number(req.body.cotizacionId) : null;
    const cotizacion = cotizacionId ? await cargarCotizacionFacturable(cotizacionId) : null;
    const preparado = await prepararExterno(req.body);
    const c = await crearExterno(preparado, { usuarioId: req.user.id, cotizacion });
    if (cotizacion) await marcarCotizacionFacturada(cotizacionId, req.user.id, { numero: `${preparado.numero} (portal SOL)` });
    res.status(201).json(conNumero(c));
  } catch (error) {
    responderError(res, error, "registrando comprobante externo");
  }
};

// Columnas de la plantilla de importación (fila 1 = encabezados).
const COLUMNAS_IMPORTACION = [
  "Tipo", "Serie", "Numero", "Fecha emision", "RUC/DNI cliente", "Cliente", "Moneda",
  "Total", "Detraccion %", "Forma de pago", "Vencimiento", "Cobrado",
];
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");

// GET /externos/plantilla — Excel con los encabezados y una fila de ejemplo.
exports.plantillaExternos = (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    COLUMNAS_IMPORTACION,
    ["Factura", "E001", 1042, "15/09/2026", "20123456789", "CLIENTE EJEMPLO S.A.C.", "PEN", 1180, 12, "Crédito", "15/10/2026", 0],
  ]);
  ws["!cols"] = COLUMNAS_IMPORTACION.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comprobantes");
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": "attachment; filename=plantilla-comprobantes-sol.xlsx",
  });
  res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};

// POST /externos/importar (archivo .xlsx/.csv); ?simular=1 solo valida.
// Responde { filas: [{ fila, numero, estado: "OK"|"ERROR"|"DUPLICADO", mensaje }], importados, simulado }.
exports.importarExternos = async (req, res) => {
  try {
    if (!req.file) throw new ErrorValidacion("Adjunta el archivo Excel");
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
    if (filas.length === 0) throw new ErrorValidacion("El archivo no tiene filas");
    if (filas.length > 1000) throw new ErrorValidacion("Máximo 1000 comprobantes por archivo");

    const columna = Object.fromEntries(COLUMNAS_IMPORTACION.map((c) => [norm(c), c]));
    const simular = req.query.simular === "1";
    const resultado = [];
    let importados = 0;

    for (const [i, original] of filas.entries()) {
      const f = {};
      for (const [k, v] of Object.entries(original)) if (columna[norm(k)]) f[columna[norm(k)]] = v;
      const fila = i + 2;
      try {
        const moneda = String(f["Moneda"] || "PEN").trim().toUpperCase();
        const preparado = await prepararExterno({
          tipo: norm(f["Tipo"]).startsWith("bol") ? "BOLETA" : "FACTURA",
          serie: f["Serie"], correlativo: f["Numero"], fechaEmision: f["Fecha emision"],
          cliente: { numDoc: String(f["RUC/DNI cliente"]).trim(), nombre: f["Cliente"] },
          moneda: moneda === "S/" ? "PEN" : moneda === "US$" ? "USD" : moneda,
          total: f["Total"], detraccionPorcentaje: f["Detraccion %"],
          formaPago: norm(f["Forma de pago"]).startsWith("cred") ? "CREDITO" : "CONTADO",
          fechaVencimiento: f["Vencimiento"], cobrado: f["Cobrado"],
        });
        const ya = await prisma.comprobante.findUnique({
          where: { serie_correlativo: { serie: preparado.datos.serie, correlativo: preparado.datos.correlativo } },
          select: { id: true },
        });
        if (ya) {
          resultado.push({ fila, numero: preparado.numero, estado: "DUPLICADO", mensaje: "Ya estaba registrado" });
          continue;
        }
        if (!simular) {
          await crearExterno(preparado, { usuarioId: req.user.id });
          importados++;
        }
        resultado.push({ fila, numero: preparado.numero, estado: "OK", mensaje: simular ? "Listo para importar" : "Importado" });
      } catch (error) {
        if (!(error instanceof ErrorValidacion) && !(error instanceof migo.ErrorMigo)) throw error;
        resultado.push({ fila, numero: [f["Serie"], f["Numero"]].filter(Boolean).join("-"), estado: "ERROR", mensaje: error.message });
      }
    }
    res.json({ filas: resultado, importados, simulado: simular });
  } catch (error) {
    responderError(res, error, "importando comprobantes externos");
  }
};

// DELETE /externos/:id — solo externos sin cobros registrados.
exports.eliminarExterno = async (req, res) => {
  try {
    const c = await prisma.comprobante.findUnique({
      where: { id: Number(req.params.id) },
      select: { id: true, origen: true, _count: { select: { pagos: true } } },
    });
    if (!c) throw new ErrorValidacion("Comprobante no encontrado", 404);
    if (c.origen !== "EXTERNO") throw new ErrorValidacion("Solo se eliminan comprobantes registrados desde fuera del ERP");
    if (c._count.pagos > 0) throw new ErrorValidacion("Tiene cobros registrados: elimínalos primero");
    await prisma.comprobante.delete({ where: { id: c.id } });
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error, "eliminando comprobante externo");
  }
};
