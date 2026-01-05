const prisma = require("../config/prisma");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendActivationEmail } = require("../services/mail.service");

// Crear cliente
exports.crear = async (req, res) => {
  try {
    console.log("📦 BODY RECIBIDO:", req.body);

    const cliente = await prisma.cliente.create({
      data: {
        nombre: req.body.nombre,
        documento: req.body.documento,
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
    const { nombre, documento, telefono, email, direccion } = req.body;

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(documento !== undefined && { documento }),
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

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente) {
      return res.status(400).json({ message: "Cliente inválido" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    if (usuario) {
      if (usuario.activo) {
        return res.status(400).json({
          message: "El usuario ya tiene una cuenta activa",
        });
      }

      // 🔁 Reinvitar
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          activationToken: token,
          activationExpires: expires,
          cliente: {
            connect: { id: cliente.id },
          },
        },
      });
    } else {
      // 🆕 Nuevo usuario
      await prisma.usuario.create({
        data: {
          nombre: cliente.nombre,
          email,
          role: "CLIENTE",
          activo: false,
          activationToken: token,
          activationExpires: expires,
          cliente: {
            connect: { id: cliente.id },
          },
        },
      });
    }

    await sendActivationEmail({
      to: email,
      name: cliente.nombre,
      token,
    });

    res.json({ message: "Invitación enviada correctamente" });
  } catch (error) {
    console.error("❌ ERROR INVITAR CLIENTE:", error);
    res.status(500).json({
      message: "Error invitando cliente",
      error: error.message,
    });
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
            i.producto.nombre
              .toLowerCase()
              .includes(producto.toLowerCase())
          )
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
