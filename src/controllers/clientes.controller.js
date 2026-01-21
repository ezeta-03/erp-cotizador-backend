const prisma = require("../config/prisma");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendActivationEmail } = require("../services/mail.service");
// const db = require("../models"); // ajusta según tu ORM/estructura
// Crear cliente
exports.crear = async (req, res) => {
  try {
    console.log("📦 BODY RECIBIDO:", req.body);

    const cliente = await prisma.cliente.create({
      data: {
        nombreComercial: req.body.nombreComercial,
        documento: req.body.documento,
        nombreContacto: req.body.nombreContacto,
        telefono: req.body.telefono,
        email: req.body.email,
        direccion: req.body.direccion,
      },
    });

    res.json(cliente);
  } catch (error) {
    console.error("❌ Prisma error:", error);
    res.status(500).json({
      message: "Error al crear cliente",
      error: error.message,
    });
  }
};

// Listar clientes
exports.listar = async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      orderBy: { id: "desc" },
    });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ message: "Error al listar clientes" });
  }
};

// Actualizar cliente
// Actualizar cliente
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const clienteId = Number(id);

    if (isNaN(clienteId)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    // Verificar que el cliente exista
    const existe = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!existe) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    // Solo actualizar campos permitidos
    const {
      nombreComercial,
      documento,
      telefono,
      nombreContacto,
      email,
      direccion,
    } = req.body;

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        ...(nombreComercial !== undefined && { nombreComercial }),
        ...(documento !== undefined && { documento }),
        ...(nombreContacto !== undefined && { nombreContacto }),
        ...(telefono !== undefined && { telefono }),
        ...(email !== undefined && { email }),
        ...(direccion !== undefined && { direccion }),
      },
    });

    res.json(cliente);
  } catch (error) {
    console.error("❌ Prisma error:", error);
    res.status(500).json({
      message: "Error al actualizar cliente",
      error: error.message,
    });
  }
};

// Eliminar cliente
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.cliente.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Cliente eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar cliente" });
  }
};

//Invitar cliente
exports.invitarCliente = async (req, res) => {
  try {
    const clienteId = Number(req.params.id);
    const { email } = req.body;

    // Verificar cliente
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });
    if (!cliente) {
      return res.status(400).json({ message: "Cliente inválido" });
    }

    // Verificar usuario existente
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email },
    });

    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    let usuarioFinal;

    if (usuarioExistente) {
      if (usuarioExistente.activo) {
        return res
          .status(400)
          .json({ message: "El usuario ya tiene una cuenta activa" });
      }

      // Reinvitar usuario inactivo
      usuarioFinal = await prisma.usuario.update({
        where: { id: usuarioExistente.id },
        data: {
          activationToken: token,
          activationExpires: expires,
        },
      });
    } else {
      // Crear nuevo usuario
      usuarioFinal = await prisma.usuario.create({
        data: {
          nombre: cliente.nombreComercial,
          email,
          role: "CLIENTE",
          activo: false,
          activationToken: token,
          activationExpires: expires,
        },
      });
    }

    // Vincular cliente con usuario (llena usuarioId en Cliente)
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: {
        usuario: { connect: { id: usuarioFinal.id } },
      },
    });

    // Responder inmediatamente para evitar timeout
    res.json({ message: "Invitación enviada correctamente" });

    // Enviar correo de activación de forma asíncrona
    try {
      await sendActivationEmail({
        to: email,
        name: cliente.nombreComercial,
        token,
      });
      console.log(`📧 Correo de invitación enviado a ${email}`);
      res.json({ message: "Invitación enviada correctamente" });
    } catch (mailError) {
      console.error("❌ ERROR ENVIANDO CORREO DE INVITACIÓN:", mailError);
      // No fallar la invitación si el correo falla

      // Si SendGrid da un error específico
      if (mailError.response) {
        console.error("Detalles SendGrid:", mailError.response.body);
      }
      res.status(500).json({
        message: "Error enviando el correo de invitación",
        error: mailError.message,
      });
    }
  } catch (error) {
    console.error("❌ ERROR INVITAR CLIENTE:", error);
    res
      .status(500)
      .json({ message: "Error invitando cliente", error: error.message });
  }
};

// ===============================
// 📊 Actividad de clientes (análisis)
// ===============================
exports.actividadClientes = async (req, res) => {
  try {
    const { cliente, producto, desde, hasta } = req.query;

    const where = {};

    // 🔍 Filtro por nombre de cliente
    if (cliente) {
      where.cliente = {
        nombreComercial: {
          contains: cliente,
        },
      };
    }

    // 📅 Filtro por fechas
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt.gte = new Date(desde);
      if (hasta) where.createdAt.lte = new Date(hasta);
    }

    // 🧱 Query principal
    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true,
        items: {
          include: {
            producto: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 🧠 Filtro por producto (post-query, más flexible)
    const filtradas = producto
      ? cotizaciones.filter((c) =>
          c.items.some((i) =>
            i.producto.material.toLowerCase().includes(producto.toLowerCase()),
          ),
        )
      : cotizaciones;

    res.json(filtradas);
  } catch (error) {
    console.error("❌ ERROR ACTIVIDAD CLIENTES:", error);
    res.status(500).json({
      message: "Error obteniendo actividad de clientes",
    });
  }
};

exports.getActividadClientes = async (req, res) => {
  try {
    const user = req.user;
    const { cliente, producto, desde, hasta } = req.query;
    const where = {};
    if (user.role === "VENTAS") {
      where.usuarioId = user.id;
    }
    if (cliente) {
      where.cliente = { nombreComercial: { contains: cliente } };
    }
    if (producto) {
      where.items = {
        some: { producto: { material: { contains: producto } } },
      };
    }
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt.gte = new Date(desde);
      if (hasta) where.createdAt.lte = new Date(hasta);
    }
    const actividad = await prisma.cotizacion.findMany({
      where,
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true } },
        items: { include: { producto: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(actividad);
  } catch (error) {
    console.error("❌ Error obteniendo actividad de clientes:", error);
    res.status(500).json({
      message: "Error obteniendo actividad de clientes",
      error: error.message,
    });
  }
};

exports.actividadesClientes = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const cotizaciones = await prisma.cotizacion.findMany({
      where: { clienteId },
      include: {
        cliente: { select: { nombreComercial: true } },
        usuario: { select: { nombre: true } },
        items: { include: { producto: { select: { material: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(cotizaciones);
  } catch (error) {
    console.error("❌ Error cargando actividad del cliente:", error);
    res.status(500).json({ message: "Error cargando actividad del cliente" });
  }
};
