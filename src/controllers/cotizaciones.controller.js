const prisma = require("../config/prisma");
const puppeteer = require("puppeteer");
const { calcularPrecioAdicional } = require("../utils/precios");
const cotizacionTemplate = require("../templates/cotizacionPdf.template");
const { generarGlosa } = require("../utils/glosa");


/* =========================
   CREAR COTIZACIÓN
========================= */
exports.crearCotizacion = async (req, res) => {
  try {
    const { numero, clienteId, items } = req.body;
    const config = await prisma.configuracion.findFirst();

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Debe agregar productos" });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: Number(clienteId) },
    });
    if (!cliente) return res.status(400).json({ message: "Cliente no existe" });

    let totalCotizacion = 0;
    const itemsData = [];

    for (const item of items) {
      const cantidad = Number(item.cantidad);
      const precioBase = Number(item.precio);
      let subtotal = cantidad * precioBase;

      // Construimos la glosa base
      let descripcion = item.material;

      const detalle = {
        productoId: Number(item.productoId),
        cantidad,
        precio: precioBase,
        subtotal,
        descripcion, // 👈 guardamos la glosa aquí
      };

      if (item.adicionales && item.adicionales.length > 0) {
        detalle.adicionales = {
          create: await Promise.all(
            item.adicionales.map(async (adicionalSeleccionado) => {
              const adicional = await prisma.productoAdicional.findUnique({
                where: { id: adicionalSeleccionado.id },
              });

              const precioFinalAdicional = calcularPrecioAdicional(
                adicional.precio,
                config
              );

              if (adicionalSeleccionado.seleccionado) {
                subtotal += precioFinalAdicional * cantidad;
                // Concatenamos a la glosa
                descripcion += ` con ${adicional.nombre}`;
              }

              return {
                adicionalId: adicional.id,
                seleccionado: adicionalSeleccionado.seleccionado,
                precio: adicionalSeleccionado.seleccionado
                  ? precioFinalAdicional
                  : 0,
              };
            })
          ),
        };

        detalle.subtotal = subtotal;
        detalle.descripcion = descripcion; // 👈 actualizamos glosa final
      }

      totalCotizacion += subtotal;
      itemsData.push(detalle);
    }

    const cotizacion = await prisma.cotizacion.create({
      data: {
        numero,
        clienteId: cliente.id,
        usuarioId: req.user.id,
        total: totalCotizacion,
        estado: "PENDIENTE",
        items: { create: itemsData },
      },
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

    res.json(cotizacion);
  } catch (error) {
    console.error("❌ Crear cotización:", error);
    res.status(500).json({ message: "Error al crear cotización" });
  }
};

/* =========================
   LISTAR (ADMIN / VENTAS)
========================= */
exports.listarCotizaciones = async (req, res) => {
  try {
    const where = req.user.role === "VENTAS" ? { usuarioId: req.user.id } : {};
    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const cotizacionesConGlosa = cotizaciones.map((c) => ({
      ...c,
      items: c.items.map((item) => ({
        ...item,
        glosa: generarGlosa(item.producto, item.adicionales),
      })),
    }));
    res.json(cotizacionesConGlosa);
  } catch (error) {
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

    if (!usuario?.cliente) {
      return res.json(null);
    }

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        clienteId: usuario.cliente.id,
      },
      include: {
        items: {
          include: { producto: true },
        },
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

    if (!["APROBADA", "RECHAZADA"].includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: Number(id) },
    });

    if (!cotizacion) {
      return res.status(404).json({ message: "Cotización no encontrada" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
    });

    if (!usuario?.clienteId || usuario.clienteId !== cotizacion.clienteId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    if (cotizacion.estado !== "PENDIENTE") {
      return res
        .status(400)
        .json({ message: "La cotización ya fue respondida" });
    }

    const updated = await prisma.cotizacion.update({
      where: { id: Number(id) },
      data: {
        estado,
        respuestaComentario: comentario || null,
        respondidaAt: new Date(),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("❌ Error respondiendo cotización:", error);
    res
      .status(500)
      .json({ message: "Error respondiendo cotización", error: error.message });
  }
};

/* =========================
   VENTAS/ADMIN: FACTURAR COTIZACIÓN
========================= */
exports.facturarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;

    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: Number(id) },
    });

    if (!cotizacion) {
      return res.status(404).json({ message: "Cotización no encontrada" });
    }

    if (cotizacion.estado !== "APROBADA") {
      return res
        .status(400)
        .json({ message: "Solo se pueden facturar cotizaciones aprobadas" });
    }

    const updated = await prisma.cotizacion.update({
      where: { id: Number(id) },
      data: {
        estado: "FACTURADA",
        facturadaAt: new Date(),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("❌ Error facturando cotización:", error);
    res.status(500).json({ message: "Error facturando cotización" });
  }
};

/* =========================
   PDF
========================= */
exports.generarPdf = async (req, res) => {
  try {
    const cotizacion = await prisma.cotizacion.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        cliente: true,
        items: { include: { producto: true } },
      },
    });

    if (!cotizacion) return res.sendStatus(404);

    // Seguridad
    if (req.user.role === "VENTAS" && cotizacion.usuarioId !== req.user.id) {
      return res.sendStatus(403);
    }

    if (
      req.user.role === "CLIENTE" &&
      cotizacion.cliente.usuarioId !== req.user.id
    ) {
      return res.sendStatus(403);
    }

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // 👇 TEMPLATE SIN MOSTRAR MARGEN
    await page.setContent(cotizacionTemplate(cotizacion));
    const pdf = await page.pdf({ format: "A4", printBackground: true });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=COT-${cotizacion.numero}.pdf`,
    });

    res.send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error generando PDF" });
  }
};

// ADMIN y VENTAS: histórico de cotizaciones
exports.historicoCotizaciones = async (req, res) => {
  try {
    const user = req.user;

    let where = {};

    // 🔐 VENTAS solo ve las suyas
    if (user.role === "VENTAS") {
      where.usuarioId = user.id;
    }

    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true,
        usuario: {
          select: { nombre: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(cotizaciones);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo histórico" });
  }
};
