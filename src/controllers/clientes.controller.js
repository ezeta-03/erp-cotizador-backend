const prisma = require("../config/prisma");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

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

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente || !cliente.email) {
      return res.status(400).json({ message: "Cliente inválido" });
    }

    // 🔑 Token de activación
    const token = crypto.randomUUID();

    // 🔒 Password temporal (nunca se usa)
    const tempPassword = await bcrypt.hash(
      crypto.randomUUID(),
      10
    );

    const usuario = await prisma.usuario.create({
      data: {
        nombre: cliente.nombre,
        email: cliente.email,
        password: tempPassword, // ✅ CLAVE
        role: "CLIENTE",
        activo: false,
        activationToken: token,
        cliente: {
          connect: { id: cliente.id },
        },
      },
    });

    const activationLink = `http://localhost:5173/activar?token=${token}`;

    console.log("🔗 LINK DE ACTIVACIÓN:");
    console.log(activationLink);

    res.json({
      message: "Cliente invitado (simulación)",
      activationLink,
    });
  } catch (error) {
    console.error("❌ ERROR INVITAR CLIENTE:", error);
    res.status(500).json({
      message: "Error invitando cliente",
      error: error.message,
    });
  }
};

