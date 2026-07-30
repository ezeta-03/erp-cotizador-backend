const prisma = require("../config/prisma");
const puppeteer = require("puppeteer");
const cotizacionTemplate = require("../templates/cotizacionPdf.template");
const { generarGlosa } = require("../utils/glosa");

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

const clamp = (v, min = 0.01) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(min, n) : min;
};

// Recalcula el precio real de un item de cotización desde el catálogo actual
// (producto/panel + adicionales), sin confiar en el precio que mande el
// cliente — así el chequeo de margen mínimo no es decorativo.
async function calcularItem(client, item, margen) {
  const cantidad = clamp(item.cantidad, 0.01);

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

  throw new Error("El item debe tener productoId o panelId");
}

/* =========================
   CREAR COTIZACIÓN
========================= */
exports.crearCotizacion = async (req, res) => {
  try {
    const { clienteId, items, margen: margenInput, conIgv, borradorId } = req.body;

    const clienteIdInt = parseInt(clienteId);
    const usuarioIdInt = req.user.id;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La cotización debe tener al menos un item" });
    }

    const MARGEN_MINIMO = 30;
    const margen = margenInput !== undefined ? Number(margenInput) : MARGEN_MINIMO;
    let solicitudUsada = null;

    if (margen < MARGEN_MINIMO) {
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

    let itemsCalculados;
    try {
      itemsCalculados = await Promise.all(items.map((item) => calcularItem(prisma, item, margen)));
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const vendedor = await prisma.usuario.findUnique({ where: { id: usuarioIdInt } });
    const secuencia = (await prisma.cotizacion.count({ where: { usuarioId: usuarioIdInt } })) + 1;
    const numero = `COT-${vendedor.id}-${new Date().getFullYear()}-${secuencia}`;

    const cotizacion = await prisma.cotizacion.create({
      data: {
        clienteId: clienteIdInt,
        usuarioId: usuarioIdInt,
        numero,
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
            panel: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    const IGV_RATE = 0.18;
    const valorVenta = cotizacion.items.reduce((acc, item) => acc + item.subtotal, 0);
    const total = parseFloat((conIgv ? valorVenta * (1 + IGV_RATE) : valorVenta).toFixed(2));

    const updated = await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: { total },
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
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

    const updated = await prisma.cotizacion.update({
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

    res.json(updated);
  } catch (error) {
    console.error("❌ Error respondiendo cotización:", error);
    res.status(500).json({ message: "Error respondiendo cotización", error: error.message });
  }
};

/* =========================
   VENTAS/ADMIN/CONTABLE: FACTURAR
========================= */
exports.facturarCotizacion = async (req, res) => {
  try {
    const cotizacionId = Number(req.params.id);

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
    });

    res.json(updated);
  } catch (error) {
    console.error("❌ Error facturando cotización:", error);
    res.status(500).json({ message: "Error facturando cotización", error: error.message });
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

    const MARGEN_MINIMO = 30;
    const margen = margenInput !== undefined ? Number(margenInput) : MARGEN_MINIMO;
    let solicitudUsada = null;

    if (margen < MARGEN_MINIMO) {
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

    const IGV_RATE = 0.18;

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
        },
        include: {
          cliente: true,
          items: {
            include: {
              producto: true,
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
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      timeout: 120000,
    });

    const page = await browser.newPage();
    await page.setContent(cotizacionTemplate(cotizacionConGlosa));
    const pdf = await page.pdf({ format: "A4", printBackground: true });
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
