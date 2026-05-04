const prisma = require("../config/prisma");
const puppeteer = require("puppeteer");
const cotizacionTemplate = require("../templates/cotizacionPdf.template");
const { generarGlosa } = require("../utils/glosa");

const IGV_RATE = 0.18;
const MARGEN_MINIMO = 30;

const roundCurrency = (v) => Math.round(v * 100) / 100;

const buildItems = (items) =>
  items.map((item) => {
    const precioFinal = Number(item.precio);
    const subtotal = precioFinal * item.cantidad;
    const glosa = item.adicionales
      ? item.adicionales.filter((a) => a.seleccionado).map((a) => `con ${a.nombre}`).join(", ")
      : "";
    return {
      productoId: item.productoId,
      cantidad: item.cantidad,
      medida: item.medida || 1,
      medidaAncho: item.medidaAncho || null,
      medidaAlto: item.medidaAlto || null,
      precio: precioFinal,
      subtotal,
      descripcion: item.descripcion || glosa,
      adicionales: item.adicionales?.length
        ? {
            create: item.adicionales.map((a) => ({
              adicionalId: a.id,
              seleccionado: a.seleccionado,
              precio: Number(a.precio),
            })),
          }
        : undefined,
    };
  });

const validarProductosActivos = async (tx, items) => {
  const ids = [...new Set(items.map((i) => i.productoId))];
  const activos = await tx.producto.findMany({
    where: { id: { in: ids }, activo: true },
    select: { id: true },
  });
  const idsActivos = new Set(activos.map((p) => p.id));
  return items.find((i) => !idsActivos.has(i.productoId)) ? false : true;
};

/* =========================
   CREAR COTIZACIÓN
========================= */
exports.crearCotizacion = async (req, res) => {
  try {
    const { clienteId, usuarioId, items, margen: margenInput, conIgv } = req.body;

    const clienteIdInt = parseInt(clienteId);
    const usuarioIdInt = parseInt(usuarioId);

    const result = await prisma.$transaction(async (tx) => {
      // ── 1. Validar margen y consumir solicitud atómicamente ──────────────────
      if (margenInput !== undefined) {
        const margen = Number(margenInput);
        if (margen < MARGEN_MINIMO) {
          const solicitud = await tx.solicitudMargen.findFirst({
            where: {
              usuarioId: usuarioIdInt,
              estado: "APROBADA",
              margenSolicitado: { lte: margen },
            },
            orderBy: { margenSolicitado: "asc" },
          });
          if (!solicitud) {
            throw Object.assign(new Error("MARGEN_NO_APROBADO"), { statusCode: 403 });
          }
          // Marca como USADA solo si aún está APROBADA (previene race condition)
          const consumed = await tx.solicitudMargen.updateMany({
            where: { id: solicitud.id, estado: "APROBADA" },
            data: { estado: "USADA" },
          });
          if (consumed.count === 0) {
            throw Object.assign(new Error("MARGEN_NO_APROBADO"), { statusCode: 403 });
          }
        }
      }

      // ── 2. Validar que todos los productos estén activos ─────────────────────
      const todosActivos = await validarProductosActivos(tx, items);
      if (!todosActivos) {
        throw Object.assign(new Error("PRODUCTO_INACTIVO"), { statusCode: 400 });
      }

      // ── 3. Generar número de cotización ──────────────────────────────────────
      const vendedor = await tx.usuario.findUnique({ where: { id: usuarioIdInt } });
      const secuencia = (await tx.cotizacion.count({ where: { usuarioId: usuarioIdInt } })) + 1;
      const numero = `COT-${vendedor.id}-${new Date().getFullYear()}-${secuencia}`;

      // ── 4. Crear cotización con items ────────────────────────────────────────
      const cotizacion = await tx.cotizacion.create({
        data: {
          clienteId: clienteIdInt,
          usuarioId: usuarioIdInt,
          numero,
          estado: "PENDIENTE",
          total: 0,
          conIgv: conIgv !== undefined ? Boolean(conIgv) : true,
          items: { create: buildItems(items) },
        },
        include: {
          cliente: true,
          items: { include: { producto: true, adicionales: { include: { adicional: true } } } },
        },
      });

      // ── 5. Calcular total con precisión ──────────────────────────────────────
      const valorVenta = cotizacion.items.reduce((acc, i) => acc + i.subtotal, 0);
      const total = roundCurrency(conIgv ? valorVenta * (1 + IGV_RATE) : valorVenta);

      return tx.cotizacion.update({
        where: { id: cotizacion.id },
        data: { total },
        include: {
          cliente: true,
          items: { include: { producto: true, adicionales: { include: { adicional: true } } } },
        },
      });
    });

    res.json(result);
  } catch (error) {
    if (error.message === "MARGEN_NO_APROBADO") {
      return res.status(error.statusCode || 403).json({
        message: "Margen por debajo del mínimo permitido. Necesitas aprobación del administrador.",
      });
    }
    if (error.message === "PRODUCTO_INACTIVO") {
      return res.status(400).json({ message: "Uno o más productos ya no están disponibles." });
    }
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
        items: { include: { producto: true } },
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
    const { id } = req.params;

    const cotizacion = await prisma.cotizacion.findUnique({ where: { id: Number(id) } });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    if (cotizacion.estado !== "APROBADA") {
      return res.status(400).json({ message: "Solo se puede facturar una cotización aprobada" });
    }

    const updated = await prisma.cotizacion.update({
      where: { id: Number(id) },
      data: { estado: "FACTURADA", facturadaAt: new Date() },
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
        items: {
          include: {
            producto: true,
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
    const { items, conIgv } = req.body;

    const cotizacion = await prisma.cotizacion.findUnique({ where: { id: Number(id) } });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    if (cotizacion.estado !== "RENEGOCIACION") {
      return res.status(400).json({ message: "Solo se pueden renegociar cotizaciones en estado de renegociación" });
    }
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.status(403).json({ message: "No autorizado" });
    }

    // ── Todo dentro de una transacción: delete + create + update atómicos ────
    const updated = await prisma.$transaction(async (tx) => {
      // Validar productos activos antes de tocar datos
      const todosActivos = await validarProductosActivos(tx, items);
      if (!todosActivos) {
        throw Object.assign(new Error("PRODUCTO_INACTIVO"), { statusCode: 400 });
      }

      // Eliminar items existentes
      const existingItems = await tx.cotizacionItem.findMany({
        where: { cotizacionId: Number(id) },
        select: { id: true },
      });
      const itemIds = existingItems.map((i) => i.id);
      if (itemIds.length > 0) {
        await tx.cotizacionAdicional.deleteMany({ where: { cotizacionItemId: { in: itemIds } } });
        await tx.cotizacionItem.deleteMany({ where: { cotizacionId: Number(id) } });
      }

      // Crear nuevos items y acumular valor de venta
      let valorVenta = 0;
      for (const item of items) {
        const precioFinal = Number(item.precio);
        const subtotal = precioFinal * item.cantidad;
        valorVenta += subtotal;

        const glosa = item.adicionales
          ? item.adicionales.filter((a) => a.seleccionado).map((a) => `con ${a.nombre}`).join(", ")
          : "";

        await tx.cotizacionItem.create({
          data: {
            cotizacionId: Number(id),
            productoId: item.productoId,
            cantidad: item.cantidad,
            medida: item.medida || 1,
            medidaAncho: item.medidaAncho || null,
            medidaAlto: item.medidaAlto || null,
            precio: precioFinal,
            subtotal,
            descripcion: item.descripcion || glosa,
            adicionales: item.adicionales?.length
              ? {
                  create: item.adicionales.map((a) => ({
                    adicionalId: a.id,
                    seleccionado: a.seleccionado,
                    precio: Number(a.precio),
                  })),
                }
              : undefined,
          },
        });
      }

      const igvFlag = conIgv !== undefined ? Boolean(conIgv) : cotizacion.conIgv;
      const total = roundCurrency(igvFlag ? valorVenta * (1 + IGV_RATE) : valorVenta);

      return tx.cotizacion.update({
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
          items: { include: { producto: true, adicionales: { include: { adicional: true } } } },
        },
      });
    });

    res.json(updated);
  } catch (error) {
    if (error.message === "PRODUCTO_INACTIVO") {
      return res.status(400).json({ message: "Uno o más productos ya no están disponibles." });
    }
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
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    if (!cotizacion) return res.sendStatus(404);

    if (req.user.role === "CLIENTE" && cotizacion.cliente.usuarioId !== req.user.id) {
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
      "Content-Disposition": `attachment; filename=COT-${cotizacion.numero}.pdf`,
    });
    res.send(pdf);
  } catch (error) {
    console.error("❌ Error generando PDF:", error.message);
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ message: "Error generando PDF" });
  }
};
