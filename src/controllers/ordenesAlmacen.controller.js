const prisma = require("../config/prisma");
const puppeteer = require("puppeteer");
const ordenAlmacenTemplate = require("../templates/ordenAlmacenPdf.template");
const { resolverProyectoId } = require("./proyectos.controller");

const ORDEN_INCLUDE = {
  cliente: { select: { id: true, nombreComercial: true } },
  usuario: { select: { id: true, nombre: true } },
  proyecto: { select: { id: true, nombre: true } },
  items: {
    include: { item: { select: { id: true, codigo: true, nombre: true, unidad: true } } },
  },
};

/* ── Listar órdenes ───────────────────────────────────────────────────────── */
exports.listarOrdenes = async (req, res) => {
  try {
    const { tipo } = req.query;
    const where = {};
    if (tipo) where.tipo = tipo;

    const ordenes = await prisma.ordenAlmacen.findMany({
      where,
      include: ORDEN_INCLUDE,
      orderBy: { fecha: "desc" },
    });
    res.json(ordenes);
  } catch (error) {
    console.error("❌ Error al listar órdenes de almacén:", error);
    res.status(500).json({ message: "Error al listar órdenes de almacén" });
  }
};

exports.obtenerOrden = async (req, res) => {
  try {
    const orden = await prisma.ordenAlmacen.findUnique({
      where: { id: Number(req.params.id) },
      include: ORDEN_INCLUDE,
    });
    if (!orden) return res.status(404).json({ message: "Orden no encontrada" });
    res.json(orden);
  } catch (error) {
    console.error("❌ Error al obtener orden de almacén:", error);
    res.status(500).json({ message: "Error al obtener orden de almacén" });
  }
};

/* ── Crear orden (varias líneas) — genera un MovimientoAlmacen por línea ──── */
exports.crearOrden = async (req, res) => {
  try {
    const { tipo, ordenServicio, clienteId, proyectoExternoId, proyectoId, notas, fecha, items } = req.body;

    if (!["ENTRADA", "SALIDA"].includes(tipo)) {
      return res.status(400).json({ message: "tipo inválido (ENTRADA o SALIDA)" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "La orden debe tener al menos un ítem" });
    }
    if (tipo === "SALIDA" && !clienteId && !proyectoExternoId) {
      return res.status(400).json({ message: "La orden de salida debe indicar clienteId y/o proyectoExternoId" });
    }

    const lineas = [];
    for (const linea of items) {
      const cant = Number(linea.cantidad);
      if (!linea.itemAlmacenId || isNaN(cant) || cant <= 0) {
        return res.status(400).json({ message: "Cada línea debe indicar itemAlmacenId y una cantidad positiva" });
      }
      lineas.push({ itemAlmacenId: Number(linea.itemAlmacenId), cantidad: cant, precioUnitarioPedido: linea.precioUnitario });
    }

    const itemsDb = await prisma.itemAlmacen.findMany({
      where: { id: { in: lineas.map((l) => l.itemAlmacenId) } },
      select: { id: true, stockActual: true, costoUnitario: true },
    });
    const itemsPorId = new Map(itemsDb.map((i) => [i.id, i]));

    for (const linea of lineas) {
      const item = itemsPorId.get(linea.itemAlmacenId);
      if (!item) return res.status(404).json({ message: `Ítem ${linea.itemAlmacenId} no encontrado` });
      if (tipo === "SALIDA" && item.stockActual < linea.cantidad) {
        return res.status(400).json({
          message: `Stock insuficiente para el ítem ${linea.itemAlmacenId}: disponible ${item.stockActual}, solicitado ${linea.cantidad}`,
        });
      }
    }

    const fechaOrden = fecha ? new Date(fecha) : new Date();
    const proyectoIdResuelto = await resolverProyectoId({ proyectoId, proyectoExternoId });

    const orden = await prisma.$transaction(async (tx) => {
      const nuevaOrden = await tx.ordenAlmacen.create({
        data: {
          tipo,
          ordenServicio: ordenServicio || null,
          clienteId: clienteId ? Number(clienteId) : null,
          proyectoExternoId: proyectoExternoId || null,
          proyectoId: proyectoIdResuelto,
          notas: notas || null,
          fecha: fechaOrden,
          usuarioId: req.user.id,
        },
      });

      for (const linea of lineas) {
        const item = itemsPorId.get(linea.itemAlmacenId);
        const precio = linea.precioUnitarioPedido !== undefined ? Number(linea.precioUnitarioPedido) : item.costoUnitario;
        const precioTotal = parseFloat((linea.cantidad * precio).toFixed(2));

        await tx.ordenAlmacenItem.create({
          data: {
            ordenId: nuevaOrden.id,
            itemAlmacenId: linea.itemAlmacenId,
            cantidad: linea.cantidad,
            precioUnitario: precio,
          },
        });

        await tx.movimientoAlmacen.create({
          data: {
            tipo,
            itemAlmacenId: linea.itemAlmacenId,
            clienteId: tipo === "SALIDA" && clienteId ? Number(clienteId) : null,
            proyectoExternoId: tipo === "SALIDA" ? (proyectoExternoId || null) : null,
            proyectoId: tipo === "SALIDA" ? proyectoIdResuelto : null,
            cantidad: linea.cantidad,
            precioUnitario: precio,
            precioTotal,
            fecha: fechaOrden,
            notas: ordenServicio ? `Orden de servicio: ${ordenServicio}` : null,
            usuarioId: req.user.id,
            ordenId: nuevaOrden.id,
          },
        });

        await tx.itemAlmacen.update({
          where: { id: linea.itemAlmacenId },
          data: { stockActual: { [tipo === "ENTRADA" ? "increment" : "decrement"]: linea.cantidad } },
        });
      }

      return tx.ordenAlmacen.findUnique({ where: { id: nuevaOrden.id }, include: ORDEN_INCLUDE });
    });

    res.status(201).json(orden);
  } catch (error) {
    console.error("❌ Error al crear orden de almacén:", error);
    res.status(500).json({ message: "Error al crear orden de almacén" });
  }
};

/* ── PDF imprimible de la orden ───────────────────────────────────────────── */
exports.pdfOrden = async (req, res) => {
  let browser = null;
  try {
    const orden = await prisma.ordenAlmacen.findUnique({
      where: { id: Number(req.params.id) },
      include: ORDEN_INCLUDE,
    });
    if (!orden) return res.sendStatus(404);

    browser = await puppeteer.launch({
      headless: true,
      // --disable-dev-shm-usage: /dev/shm suele venir muy chico en hosting con
      // poca RAM (Render free tier) y Chrome se cae al abrir páginas grandes
      // si no se le dice que use /tmp en su lugar.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      timeout: 120000,
    });
    const page = await browser.newPage();
    await page.setContent(ordenAlmacenTemplate(orden));
    // page.pdf() devuelve un Uint8Array, no un Buffer real — Express no lo
    // reconoce como binario y lo manda como JSON si no se envuelve acá.
    const pdf = Buffer.from(await page.pdf({ format: "A4", printBackground: true }));
    await browser.close();
    browser = null;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=ORDEN-ALM-${orden.id}.pdf`,
    });
    res.send(pdf);
  } catch (error) {
    console.error("❌ Error generando PDF de orden:", error.message);
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ message: "Error generando PDF" });
  }
};
