const prisma = require("../config/prisma");
const puppeteer = require("puppeteer");
const cotizacionTemplate = require("../templates/cotizacionPdf.template");
const { generarGlosa } = require("../utils/glosa");
const { crearProyectoDesdeCotizacion } = require("../services/proyectoBridge");
const { esNetwise } = require("../middlewares/netwise.middleware");
const { IGV_RATE, MARGEN_MINIMO } = require("../config/negocio");
const { leerCondicion } = require("../utils/condicionPago");
const { Prisma } = require("@prisma/client");
const { copiaCuentas, cuentasParaDocumentos, cuentasSugeridas } = require("../services/cajaBancos.service");

// Cuentas a guardar en la cotización: las elegidas (body.cuentaBancariaIds) o,
// si no vienen, las sugeridas en soles (con la de detracciones si pasa de S/ 700).
async function cuentasDeCotizacion(elegidas, total) {
  if (elegidas !== undefined) return elegidas ?? Prisma.JsonNull;
  const sugeridas = cuentasSugeridas(await cuentasParaDocumentos(), { moneda: "PEN", conDetraccion: total > 700 });
  return sugeridas.length ? sugeridas : Prisma.JsonNull;
}
const { crearDesdeCotizacion: crearProyectoInterno } = require("./proyectos.controller");

const registrarLog = (client, { cotizacionId, usuarioId, estadoAnterior, estadoNuevo, comentario }) =>
  client.cotizacionLog.create({
    data: {
      cotizacionId,
      usuarioId,
      estadoAnterior: estadoAnterior || null,
      estadoNuevo,
      comentario: comentario || null,
    },
  });

// Siguiente número del vendedor en el año en curso: COT-{vendedor}-{año}-{n}.
// Las de Netwise llevan su propia serie: NW-{año}-{n}.
// Toma el mayor n existente (no un conteo), así no se repite aunque haya
// huecos o cotizaciones de años anteriores.
async function siguienteNumero(vendedorId, marca = "ZAAZMAGO") {
  const anio = new Date().getFullYear();
  const prefijo = marca === "NETWISE" ? `NW-${anio}-` : `COT-${vendedorId}-${anio}-`;
  const previas = await prisma.cotizacion.findMany({
    where: { numero: { startsWith: prefijo } },
    select: { numero: true },
  });
  const mayor = previas.reduce((m, c) => Math.max(m, parseInt(c.numero.slice(prefijo.length), 10) || 0), 0);
  return `${prefijo}${mayor + 1}`;
}

const clamp = (v, min = 0.01) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(min, n) : min;
};

// Recalcula el precio real de un item de cotización desde el catálogo actual
// (producto/panel + adicionales), sin confiar en el precio que mande el
// cliente — así el chequeo de margen mínimo no es decorativo.
async function calcularItem(client, item, margen) {
  const cantidad = clamp(item.cantidad, 0.01);

  // Servicio Netwise: precio de venta del catálogo, sin margen ni medidas.
  if (item.servicioNetwiseId) {
    const servicio = await client.servicioNetwise.findUnique({ where: { id: parseInt(item.servicioNetwiseId) } });
    if (!servicio) throw new Error(`Servicio ${item.servicioNetwiseId} no existe`);
    const precio = parseFloat(Number(servicio.precio).toFixed(2));
    const subtotal = parseFloat((precio * cantidad).toFixed(2));
    return { precio, subtotal, cantidad, medida: 1, medidaAncho: null, medidaAlto: null, adicionalesValidados: [] };
  }

  if (item.productoId) {
    const producto = await client.producto.findUnique({
      where: { id: parseInt(item.productoId) },
      include: { adicionales: true },
    });
    if (!producto) throw new Error(`Producto ${item.productoId} no existe`);

    const tipoMedida = producto.tipoMedida || "UNIDAD";
    let medida = 1;
    let medidaAncho = null;
    let medidaAlto = null;
    if (tipoMedida === "AREA") {
      medidaAncho = clamp(item.medidaAncho, 0.01);
      medidaAlto = clamp(item.medidaAlto, 0.01);
      medida = parseFloat((medidaAncho * medidaAlto).toFixed(6));
    } else if (tipoMedida !== "UNIDAD") {
      medida = clamp(item.medida, 0.01);
    }

    const solicitadas = (item.adicionales || []).filter((a) => a.seleccionado);
    const adicionalesValidados = [];
    let sumaAdicionales = 0;
    for (const a of solicitadas) {
      const real = producto.adicionales.find((pa) => pa.id === parseInt(a.id));
      if (!real) continue; // ignora adicionales que no pertenecen a este producto
      sumaAdicionales += real.precio;
      adicionalesValidados.push({ id: real.id, nombre: real.nombre, precio: real.precio });
    }

    const precioBase = parseFloat((producto.precio_final * medida + sumaAdicionales).toFixed(2));
    const precio = parseFloat((precioBase * (1 + margen / 100)).toFixed(2));
    const subtotal = parseFloat((precio * cantidad).toFixed(2));

    return { precio, subtotal, cantidad, medida, medidaAncho, medidaAlto, adicionalesValidados };
  }

  if (item.panelId) {
    const panel = await client.panel.findUnique({ where: { id: parseInt(item.panelId) } });
    if (!panel) throw new Error(`Panel ${item.panelId} no existe`);

    const nombre = item.nombre || "";
    let base = panel.precioMes;
    if (nombre.startsWith("Producción")) base = panel.costoProduccion;
    else if (nombre.startsWith("Instalación")) base = panel.costoInstalacion;

    const precioBase = parseFloat(Number(base || 0).toFixed(2));
    const precio = parseFloat((precioBase * (1 + margen / 100)).toFixed(2));
    const subtotal = parseFloat((precio * cantidad).toFixed(2));

    return { precio, subtotal, cantidad, medida: 1, medidaAncho: null, medidaAlto: null, adicionalesValidados: [] };
  }

  throw new Error("El item debe tener productoId, panelId o servicioNetwiseId");
}

// Una cotización Netwise solo lleva servicios Netwise, y viceversa.
function validarItemsMarca(items, marca) {
  const netwise = marca === "NETWISE";
  for (const item of items) {
    if (netwise !== Boolean(item.servicioNetwiseId)) {
      throw new Error(netwise
        ? "Las cotizaciones Netwise solo llevan servicios del catálogo Netwise"
        : "Los servicios Netwise se cotizan desde el módulo Netwise");
    }
  }
}

/* =========================
   CREAR COTIZACIÓN
========================= */
exports.crearCotizacion = async (req, res) => {
  try {
    const { clienteId, items, margen: margenInput, conIgv, borradorId } = req.body;

    const clienteIdInt = parseInt(clienteId);
    const usuarioIdInt = req.user.id;
    const marca = req.body.marca === "NETWISE" ? "NETWISE" : "ZAAZMAGO";

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La cotización debe tener al menos un item" });
    }
    if (marca === "NETWISE" && !esNetwise(req.user)) {
      return res.status(403).json({ message: "Solo para el módulo Netwise" });
    }
    try {
      validarItemsMarca(items, marca);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    // Netwise cotiza a precio de catálogo: sin margen ni aprobaciones.
    const margen = marca === "NETWISE" ? 0 : (margenInput !== undefined ? Number(margenInput) : MARGEN_MINIMO);
    let solicitudUsada = null;

    if (marca !== "NETWISE" && margen < MARGEN_MINIMO) {
      const solicitud = borradorId
        ? await prisma.solicitudMargen.findFirst({
            where: {
              usuarioId: usuarioIdInt,
              clienteId: clienteIdInt,
              borradorId,
              estado: "APROBADA",
              margenSolicitado: { lte: margen },
            },
            orderBy: { margenSolicitado: "asc" },
          })
        : null;
      if (!solicitud) {
        return res.status(403).json({
          message: "Margen por debajo del mínimo permitido. Necesitas aprobación del administrador.",
        });
      }
      solicitudUsada = solicitud;
    }

    let itemsCalculados, condicion, cuentasElegidas;
    try {
      cuentasElegidas = await copiaCuentas(req.body.cuentaBancariaIds);
      itemsCalculados = await Promise.all(items.map((item) => calcularItem(prisma, item, margen)));
      // Sin condición en el body, la cotización hereda la del cliente.
      condicion = leerCondicion(req.body) ?? await prisma.cliente.findUnique({
        where: { id: clienteIdInt }, select: { condicionPago: true, diasCredito: true },
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const crear = (numero) => prisma.cotizacion.create({
      data: {
        clienteId: clienteIdInt,
        condicionPago: condicion?.condicionPago ?? "CONTADO",
        diasCredito: condicion?.diasCredito ?? null,
        usuarioId: usuarioIdInt,
        numero,
        marca,
        estado: "PENDIENTE",
        total: 0,
        conIgv: conIgv !== undefined ? Boolean(conIgv) : true,
        items: {
          create: items.map((item, i) => {
            const calc = itemsCalculados[i];
            const glosa = calc.adicionalesValidados.length
              ? calc.adicionalesValidados.map((a) => `con ${a.nombre}`).join(", ")
              : "";

            return {
              productoId: item.productoId ? parseInt(item.productoId) : null,
              panelId: item.panelId ? parseInt(item.panelId) : null,
              servicioNetwiseId: item.servicioNetwiseId ? parseInt(item.servicioNetwiseId) : null,
              nombre: item.nombre || null,
              cantidad: calc.cantidad,
              medida: calc.medida,
              medidaAncho: calc.medidaAncho,
              medidaAlto: calc.medidaAlto,
              precio: calc.precio,
              subtotal: calc.subtotal,
              descripcion: item.descripcion || glosa,
              adicionales: calc.adicionalesValidados.length
                ? {
                    create: calc.adicionalesValidados.map((a) => ({
                      adicionalId: a.id,
                      seleccionado: true,
                      precio: a.precio,
                    })),
                  }
                : undefined,
            };
          }),
        },
      },
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
            servicioNetwise: true,
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    // numero es @unique: si otra cotización del mismo vendedor se creó a la vez
    // y tomó el mismo número, se recalcula y se reintenta.
    let cotizacion;
    for (let intento = 1; ; intento++) {
      try {
        cotizacion = await crear(await siguienteNumero(usuarioIdInt, marca));
        break;
      } catch (err) {
        if (err.code !== "P2002" || intento >= 3) throw err;
      }
    }

    const valorVenta = cotizacion.items.reduce((acc, item) => acc + item.subtotal, 0);
    const total = parseFloat((conIgv ? valorVenta * (1 + IGV_RATE) : valorVenta).toFixed(2));

    const updated = await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: { total, cuentasBancarias: await cuentasDeCotizacion(cuentasElegidas, total) },
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
            servicioNetwise: true,
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    if (solicitudUsada) {
      await prisma.solicitudMargen.update({
        where: { id: solicitudUsada.id },
        data: { estado: "USADA", cotizacionId: updated.id },
      });
    }

    await registrarLog(prisma, {
      cotizacionId: updated.id,
      usuarioId: usuarioIdInt,
      estadoAnterior: null,
      estadoNuevo: "PENDIENTE",
    });

    res.json(updated);
  } catch (error) {
    console.error("❌ Error creando cotización:", error);
    res.status(500).json({ message: "Error creando cotización", detail: error.message });
  }
};

/* =========================
   LISTAR (ADMIN / VENTAS / CONTABLE)
========================= */
exports.listarCotizaciones = async (req, res) => {
  try {
    const user = req.user;
    const where = {};

    if (user.role === "VENTAS") {
      where.usuarioId = user.id;
    }

    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true,
        usuario: { select: { nombre: true, email: true } },
        items: {
          include: {
            producto: true,
            servicioNetwise: true,
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(cotizaciones);
  } catch (error) {
    console.error("❌ Error al listar cotizaciones:", error);
    res.status(500).json({ message: "Error al listar cotizaciones" });
  }
};

/* =========================
   CLIENTE: ÚLTIMA COTIZACIÓN
========================= */
exports.ultimaCotizacionCliente = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      include: { cliente: true },
    });

    if (!usuario?.cliente) return res.json(null);

    const cotizacion = await prisma.cotizacion.findFirst({
      where: { clienteId: usuario.cliente.id },
      include: {
        items: { include: { producto: true, panel: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(cotizacion);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo cotización" });
  }
};

/* =========================
   CLIENTE: RESPONDER COTIZACIÓN
========================= */
exports.responderCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentario } = req.body;

    if (!["APROBADA", "RENEGOCIACION"].includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const cotizacion = await prisma.cotizacion.findUnique({ where: { id: Number(id) } });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });

    const cliente = await prisma.cliente.findUnique({ where: { id: cotizacion.clienteId } });
    if (!cliente || cliente.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (cotizacion.estado !== "PENDIENTE") {
      return res.status(400).json({ message: "La cotización ya fue respondida" });
    }

    let updated = await prisma.cotizacion.update({
      where: { id: Number(id) },
      data: { estado, respuestaComentario: comentario || null, respondidaAt: new Date() },
    });

    await registrarLog(prisma, {
      cotizacionId: Number(id),
      usuarioId: req.user.id,
      estadoAnterior: cotizacion.estado,
      estadoNuevo: estado,
      comentario: comentario || null,
    });

    // Al aprobar, crear el Proyecto correspondiente en seguimiento-actividades (Firestore)
    // Y el Proyecto interno del ERP (responsables + comparación contra Almacén). Ninguno
    // de los dos bloquea la aprobación: si alguno falla, la cotización queda APROBADA igual.
    if (estado === "APROBADA") {
      const vendedor = await prisma.usuario.findUnique({ where: { id: cotizacion.usuarioId } });
      const resultado = await crearProyectoDesdeCotizacion({ cotizacion: updated, cliente, vendedor });
      updated = await prisma.cotizacion.update({
        where: { id: Number(id) },
        data: resultado.id
          ? { proyectoExternoId: resultado.id, proyectoExternoError: null }
          : { proyectoExternoError: resultado.error },
      });
      await crearProyectoInterno({ cotizacion: updated, cliente, proyectoFirestoreId: resultado.id });
    }

    res.json(updated);
  } catch (error) {
    console.error("❌ Error respondiendo cotización:", error);
    res.status(500).json({ message: "Error respondiendo cotización", error: error.message });
  }
};

/* =========================
   VENTAS/ADMIN/CONTABLE: FACTURAR
========================= */
// Marca FACTURADA una cotización cuya factura se emitió fuera del ERP (p. ej.
// en el portal SOL). Si llega comprobanteExterno ("E001-1042") queda en el
// historial. Las emitidas desde el ERP pasan a FACTURADA solas al ser aceptadas.
exports.facturarCotizacion = async (req, res) => {
  try {
    const cotizacionId = Number(req.params.id);
    const comprobanteExterno = String(req.body?.comprobanteExterno || "").trim().toUpperCase();
    if (comprobanteExterno && !/^[A-Z0-9]{4}-\d{1,8}$/.test(comprobanteExterno)) {
      return res.status(400).json({ message: "El número del comprobante debe tener la forma E001-1042" });
    }

    const cotizacion = await prisma.cotizacion.findUnique({ where: { id: cotizacionId } });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }

    // updateMany con el estado en el WHERE: si dos peticiones llegan casi a
    // la vez, solo una encuentra la fila todavía en APROBADA y la cambia; la
    // otra recibe count=0 y el 400 de abajo, en vez de facturar dos veces.
    const { count } = await prisma.cotizacion.updateMany({
      where: { id: cotizacionId, estado: "APROBADA" },
      data: { estado: "FACTURADA", facturadaAt: new Date() },
    });

    if (count === 0) {
      return res.status(400).json({ message: "Solo se puede facturar una cotización aprobada" });
    }

    const updated = await prisma.cotizacion.findUnique({ where: { id: cotizacionId } });

    await registrarLog(prisma, {
      cotizacionId,
      usuarioId: req.user.id,
      estadoAnterior: "APROBADA",
      estadoNuevo: "FACTURADA",
      comentario: comprobanteExterno ? `Facturada fuera del ERP: ${comprobanteExterno}` : null,
    });

    res.json(updated);
  } catch (error) {
    console.error("❌ Error facturando cotización:", error);
    res.status(500).json({ message: "Error facturando cotización", error: error.message });
  }
};

/* =========================
   CONDICIÓN DE PAGO (contado / crédito a N días)
   Se puede cambiar mientras la cotización no esté facturada.
========================= */
exports.actualizarCondicionPago = async (req, res) => {
  try {
    const condicion = leerCondicion(req.body);
    if (!condicion) return res.status(400).json({ message: "Indica la condición de pago" });
    const cotizacion = await prisma.cotizacion.findUnique({ where: { id: Number(req.params.id) } });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }
    if (cotizacion.estado === "FACTURADA") {
      return res.status(400).json({ message: "La cotización ya está facturada: la condición se ve en el comprobante" });
    }
    res.json(await prisma.cotizacion.update({ where: { id: cotizacion.id }, data: condicion }));
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error("❌ Error actualizando condición de pago:", error);
    res.status(500).json({ message: "Error actualizando condición de pago", error: error.message });
  }
};

/* =========================
   OBTENER COTIZACIÓN ESPECÍFICA
========================= */
exports.obtenerCotizacion = async (req, res) => {
  try {
    const { id } = req.params;

    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: Number(id) },
      include: {
        cliente: true,
        usuario: { select: { nombre: true, role: true } },
        items: {
          include: {
            producto: true,
            servicioNetwise: true,
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });

    if (req.user.role === "CLIENTE" && cotizacion.cliente.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }

    res.json(cotizacion);
  } catch (error) {
    console.error("❌ Error obteniendo cotización:", error);
    res.status(500).json({ message: "Error obteniendo cotización" });
  }
};

/* =========================
   HISTÓRICO (ADMIN / VENTAS)
========================= */
exports.historicoCotizaciones = async (req, res) => {
  try {
    const user = req.user;
    const where = {};
    if (user.role === "VENTAS") where.usuarioId = user.id;

    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true,
        usuario: { select: { nombre: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(cotizaciones);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo histórico" });
  }
};

/* =========================
   CLIENTE: TODAS SUS COTIZACIONES
========================= */
exports.misCotizaciones = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      include: { cliente: true },
    });
    if (!usuario?.cliente) return res.json([]);

    const cotizaciones = await prisma.cotizacion.findMany({
      where: { clienteId: usuario.cliente.id },
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
            servicioNetwise: true,
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
        usuario: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(cotizaciones);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo cotizaciones" });
  }
};

/* =========================
   VENTAS/ADMIN: RENEGOCIAR (actualizar items de una RECHAZADA y resetear a PENDIENTE)
========================= */
exports.renegociarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, conIgv, margen: margenInput } = req.body;

    const cotizacion = await prisma.cotizacion.findUnique({ where: { id: Number(id) } });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    if (cotizacion.estado !== "RENEGOCIACION") {
      return res.status(400).json({ message: "Solo se pueden renegociar cotizaciones en estado de renegociación" });
    }
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La cotización debe tener al menos un item" });
    }
    if (cotizacion.marca === "NETWISE" && !esNetwise(req.user)) {
      return res.status(403).json({ message: "Solo para el módulo Netwise" });
    }
    let condicion, cuentasElegidas;
    try {
      validarItemsMarca(items, cotizacion.marca);
      condicion = leerCondicion(req.body);
      cuentasElegidas = await copiaCuentas(req.body.cuentaBancariaIds);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const netwise = cotizacion.marca === "NETWISE";
    const margen = netwise ? 0 : (margenInput !== undefined ? Number(margenInput) : MARGEN_MINIMO);
    let solicitudUsada = null;

    if (!netwise && margen < MARGEN_MINIMO) {
      const solicitud = await prisma.solicitudMargen.findFirst({
        where: {
          usuarioId: cotizacion.usuarioId,
          clienteId: cotizacion.clienteId,
          cotizacionId: cotizacion.id,
          estado: "APROBADA",
          margenSolicitado: { lte: margen },
        },
        orderBy: { margenSolicitado: "asc" },
      });
      if (!solicitud) {
        return res.status(403).json({
          message: "Margen por debajo del mínimo permitido. Necesitas aprobación del administrador.",
        });
      }
      solicitudUsada = solicitud;
    }


    const updated = await prisma.$transaction(async (tx) => {
      const existingItems = await tx.cotizacionItem.findMany({
        where: { cotizacionId: Number(id) },
        select: { id: true },
      });
      const itemIds = existingItems.map((i) => i.id);
      if (itemIds.length > 0) {
        await tx.cotizacionAdicional.deleteMany({ where: { cotizacionItemId: { in: itemIds } } });
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: Number(id) } });
      }

      let valorVenta = 0;

      for (const item of items) {
        const calc = await calcularItem(tx, item, margen);
        valorVenta += calc.subtotal;

        const glosa = calc.adicionalesValidados.length
          ? calc.adicionalesValidados.map((a) => `con ${a.nombre}`).join(", ")
          : "";

        await tx.cotizacionItem.create({
          data: {
            cotizacionId: Number(id),
            productoId: item.productoId ? parseInt(item.productoId) : null,
            panelId: item.panelId ? parseInt(item.panelId) : null,
            servicioNetwiseId: item.servicioNetwiseId ? parseInt(item.servicioNetwiseId) : null,
            nombre: item.nombre || null,
            cantidad: calc.cantidad,
            medida: calc.medida,
            medidaAncho: calc.medidaAncho,
            medidaAlto: calc.medidaAlto,
            precio: calc.precio,
            subtotal: calc.subtotal,
            descripcion: item.descripcion || glosa,
            adicionales: calc.adicionalesValidados.length
              ? {
                  create: calc.adicionalesValidados.map((a) => ({
                    adicionalId: a.id,
                    seleccionado: true,
                    precio: a.precio,
                  })),
                }
              : undefined,
          },
        });
      }

      const igvFlag = conIgv !== undefined ? Boolean(conIgv) : cotizacion.conIgv;
      const total = parseFloat((igvFlag ? valorVenta * (1 + IGV_RATE) : valorVenta).toFixed(2));

      const result = await tx.cotizacion.update({
        where: { id: Number(id) },
        data: {
          estado: "PENDIENTE",
          respuestaComentario: null,
          respondidaAt: null,
          total,
          conIgv: igvFlag,
          ...condicion,
          ...(cuentasElegidas !== undefined && { cuentasBancarias: cuentasElegidas ?? Prisma.JsonNull }),
        },
        include: {
          cliente: true,
          items: {
            include: {
              producto: true,
              servicioNetwise: true,
              panel: true,
              adicionales: { include: { adicional: true } },
            },
          },
        },
      });

      await registrarLog(tx, {
        cotizacionId: Number(id),
        usuarioId: req.user.id,
        estadoAnterior: "RENEGOCIACION",
        estadoNuevo: "PENDIENTE",
      });

      return result;
    });

    if (solicitudUsada) {
      await prisma.solicitudMargen.update({
        where: { id: solicitudUsada.id },
        data: { estado: "USADA" },
      });
    }

    res.json(updated);
  } catch (error) {
    console.error("❌ Error renegociando cotización:", error);
    res.status(500).json({ message: "Error renegociando cotización", detail: error.message });
  }
};

/* =========================
   PDF
========================= */
exports.generarPdf = async (req, res) => {
  let browser = null;
  try {
    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
            servicioNetwise: true,
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    if (!cotizacion) return res.sendStatus(404);

    if (req.user.role === "CLIENTE" && cotizacion.cliente.usuarioId !== req.user.id) {
      return res.sendStatus(403);
    }
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.sendStatus(403);
    }

    const cotizacionConGlosa = {
      ...cotizacion,
      items: cotizacion.items.map((item) => ({
        ...item,
        glosa: item.descripcion || generarGlosa(item.producto, item.adicionales || []),
      })),
    };

    browser = await puppeteer.launch({
      headless: true,
      // --disable-dev-shm-usage: /dev/shm suele venir muy chico en hosting con
      // poca RAM (Render free tier) y Chrome se cae al abrir páginas grandes
      // si no se le dice que use /tmp en su lugar.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      timeout: 120000,
    });

    const page = await browser.newPage();
    await page.setContent(cotizacionTemplate(cotizacionConGlosa));
    // page.pdf() devuelve un Uint8Array, no un Buffer real — Express no lo
    // reconoce como binario y lo manda como JSON si no se envuelve acá.
    const pdf = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
    await browser.close();
    browser = null;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${cotizacion.numero}.pdf`,
    });
    res.send(pdf);
  } catch (error) {
    console.error("❌ Error generando PDF:", error.message);
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ message: "Error generando PDF" });
  }
};

/* =========================
   LOG DE ESTADOS
========================= */
exports.obtenerLog = async (req, res) => {
  try {
    const cotizacionId = Number(req.params.id);

    if (req.user.role === "CLIENTE" || req.user.role === "VENTAS") {
      const cotizacion = await prisma.cotizacion.findUnique({
        where: { id: cotizacionId },
        include: { cliente: true },
      });
      if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
      if (req.user.role === "CLIENTE" && cotizacion.cliente.usuarioId !== req.user.id) {
        return res.status(403).json({ message: "No autorizado" });
      }
      if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
        return res.status(403).json({ message: "No autorizado" });
      }
    }

    const log = await prisma.cotizacionLog.findMany({
      where: { cotizacionId },
      include: { usuario: { select: { nombre: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json(log);
  } catch (error) {
    console.error("❌ Error obteniendo log:", error);
    res.status(500).json({ message: "Error obteniendo log de cotización" });
  }
};
