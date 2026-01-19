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
    const { clienteId, usuarioId, items } = req.body;

    // Parse IDs to integers
    const clienteIdInt = parseInt(clienteId);
    const usuarioIdInt = parseInt(usuarioId);

    // Configuración global
    const configuracion = await prisma.configuracion.findFirst();

    // Generar número oficial de cotización por vendedor
    const vendedor = await prisma.usuario.findUnique({
      where: { id: usuarioIdInt },
    });
    const secuencia =
      (await prisma.cotizacion.count({ where: { usuarioId: usuarioIdInt } })) + 1;
    const numero = `COT-${vendedor.username || vendedor.id}-${new Date().getFullYear()}-${secuencia}`;

    // Crear cotización con items
    const cotizacion = await prisma.cotizacion.create({
      data: {
        clienteId: clienteIdInt,
        usuarioId: usuarioIdInt,
        numero,
        estado: "PENDIENTE",
        total: 0,
        items: {
          create: items.map((item) => {
            // cálculos base
            const costoParcial1 =
              item.costo_material * (1 + configuracion.costo_indirecto);
            const costoParcial2 =
              costoParcial1 * (1 + configuracion.porcentaje_administrativo);
            const precioBase = costoParcial2 * (1 + configuracion.rentabilidad);

            // suma de adicionales seleccionados
            const sumaAdicionales = item.adicionales
              ? item.adicionales
                  .filter((a) => a.seleccionado)
                  .reduce((acc, a) => acc + Number(a.precio || 0), 0)
              : 0;

            const precioFinal = precioBase + sumaAdicionales;
            const subtotal = precioFinal * item.cantidad;

            // glosa con "con"/"sin"
            const glosa = item.adicionales
              ? item.adicionales
                  .map((a) =>
                    a.seleccionado ? `con ${a.nombre}` : `sin ${a.nombre}`
                  )
                  .join(", ")
              : "";

            return {
              productoId: item.productoId,
              cantidad: item.cantidad,
              precio: precioFinal,
              subtotal,
              descripcion: glosa,
              adicionales: item.adicionales
                ? {
                    create: item.adicionales.map((a) => ({
                      adicionalId: a.id, // 👈 usa id como adicionalId
                      seleccionado: a.seleccionado, // true/false
                      precio: Number(a.precio),
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
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    // recalcular total
    const total = cotizacion.items.reduce(
      (acc, item) => acc + item.subtotal,
      0
    );

    const updated = await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: { total },
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

    res.json(updated);
  } catch (error) {
    console.error("❌ Error creando cotización:", error);
    res
      .status(500)
      .json({ message: "Error creando cotización", detail: error.message });
  }
};

/* =========================
   LISTAR (ADMIN / VENTAS)
========================= */
exports.listarCotizaciones = async (req, res) => {
  try {
    // Datos ficticios para desarrollo
    const cotizacionesFicticias = [
      {
        id: 1,
        numero: "COT-2026-001",
        total: 15000,
        estado: "PENDIENTE",
        createdAt: "2026-01-15T10:00:00Z",
        cliente: {
          nombreComercial: "Empresa ABC SAC"
        },
        usuario: {
          nombre: "Juan Pérez",
          email: "juan@ventas.com"
        },
        items: [
          {
            cantidad: 10,
            precio: 1500,
            subtotal: 15000,
            descripcion: "Vinil básico para fachada",
            producto: {
              nombre: "Vinil Básico"
            }
          }
        ]
      },
      {
        id: 2,
        numero: "COT-2026-002",
        total: 25000,
        estado: "APROBADA",
        createdAt: "2026-01-14T14:30:00Z",
        cliente: {
          nombreComercial: "Constructora XYZ"
        },
        usuario: {
          nombre: "Ana García",
          email: "ana@ventas.com"
        },
        items: [
          {
            cantidad: 5,
            precio: 5000,
            subtotal: 25000,
            descripcion: "Letreros 3D",
            producto: {
              nombre: "Letrero 3D"
            }
          }
        ]
      },
      {
        id: 3,
        numero: "COT-2026-003",
        total: 8000,
        estado: "FACTURADA",
        createdAt: "2026-01-13T09:15:00Z",
        cliente: {
          nombreComercial: "Tienda Local EIRL"
        },
        usuario: {
          nombre: "Juan Pérez",
          email: "juan@ventas.com"
        },
        items: [
          {
            cantidad: 2,
            precio: 4000,
            subtotal: 8000,
            descripcion: "Banner publicitario",
            producto: {
              nombre: "Banner Delgado"
            }
          }
        ]
      },
      {
        id: 4,
        numero: "COT-2026-004",
        total: 12000,
        estado: "RECHAZADA",
        createdAt: "2026-01-12T16:45:00Z",
        cliente: {
          nombreComercial: "Restaurante Gourmet"
        },
        usuario: {
          nombre: "Ana García",
          email: "ana@ventas.com"
        },
        items: [
          {
            cantidad: 3,
            precio: 4000,
            subtotal: 12000,
            descripcion: "Instalación de letreros luminosos",
            producto: {
              nombre: "Letrero Luminoso"
            }
          }
        ]
      },
      {
        id: 5,
        numero: "COT-2026-005",
        total: 22000,
        estado: "PENDIENTE",
        createdAt: "2026-01-11T11:20:00Z",
        cliente: {
          nombreComercial: "Centro Comercial Plaza"
        },
        usuario: {
          nombre: "Juan Pérez",
          email: "juan@ventas.com"
        },
        items: [
          {
            cantidad: 8,
            precio: 2750,
            subtotal: 22000,
            descripcion: "Vinil retroiluminado para escaparates",
            producto: {
              nombre: "Vinil Retroiluminado"
            }
          }
        ]
      }
    ];

    res.json(cotizacionesFicticias);
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

    // Buscar el cliente vinculado a la cotización
    const cliente = await prisma.cliente.findUnique({
      where: { id: cotizacion.clienteId },
    });

    // Validar que el usuario autenticado es el dueño de ese cliente
    if (!cliente || cliente.usuarioId !== req.user.id) {
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
        .json({ message: "Solo se puede facturar una cotización aprobada" });
    }

    // Validar rol
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
    });
    if (usuario?.role !== "VENTAS" && usuario?.role !== "ADMIN") {
      return res.status(403).json({ message: "No autorizado para facturar" });
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
    res
      .status(500)
      .json({ message: "Error facturando cotización", error: error.message });
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
        items: {
          include: {
            producto: true,
            adicionales: { include: { adicional: true } },
          },
        },
      },
    });

    if (!cotizacion) return res.sendStatus(404);

    // Agregar glosa a los items para el template
    const cotizacionConGlosa = {
      ...cotizacion,
      items: cotizacion.items.map((item) => ({
        ...item,
        glosa: generarGlosa(item.producto, item.adicionales),
      })),
    };

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
    await page.setContent(cotizacionTemplate(cotizacionConGlosa));
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
