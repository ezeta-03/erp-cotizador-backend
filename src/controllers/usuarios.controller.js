const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendActivationEmail } = require("../services/mail.service");

// Crear usuario
exports.crear = async (req, res) => {
  try {
    const { nombre, email, password, role, clienteId } = req.body;

    const hash = await bcrypt.hash(password, 10);

    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        password: hash,
        role,
        clienteId: role === "CLIENTE" ? clienteId : null,
        activo: true, // por defecto activo
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        clienteId: true,
        activo: true,
        createdAt: true,
      },
    });

    res.json(usuario);
  } catch (error) {
    console.error("❌ Error creando usuario:", error);
    res.status(500).json({ message: "Error al crear usuario", error });
  }
};

// Listar usuarios (todos)
exports.listar = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      orderBy: { id: "desc" },
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        clienteId: true,
        activo: true,
        createdAt: true,
      },
    });

    res.json(usuarios);
  } catch (error) {
    console.error("❌ Error listando usuarios:", error);
    res.status(500).json({ message: "Error al listar usuarios", error });
  }
};

// Actualizar usuario
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, email, password, role, clienteId, activo } = req.body;

    const data = {
      nombre,
      email,
      role,
      clienteId: role === "CLIENTE" ? clienteId || null : null,
    };

    if (typeof activo !== "undefined") data.activo = activo;

    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data,
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        clienteId: true,
        activo: true,
        createdAt: true,
      },
    });

    res.json(usuario);
  } catch (error) {
    console.error("❌ Error actualizando usuario:", error);
    res.status(500).json({ message: "Error al actualizar usuario", error });
  }
};

// Eliminar usuario (soft delete: marcar como inactivo)
exports.eliminar = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { activo: false },
      select: { id: true },
    });

    res.json({ success: true, id: usuario.id });
  } catch (error) {
    console.error("❌ Error eliminando usuario:", error);
    res.status(500).json({ message: "Error al eliminar usuario", error });
  }
};

// Activar / desactivar usuario
exports.cambiarEstado = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body; // true o false

    if (typeof activo === "undefined") {
      return res.status(400).json({ message: "Debe indicar el estado (activo)" });
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { activo },
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        clienteId: true,
        activo: true,
        createdAt: true,
      },
    });

    res.json(usuario);
  } catch (error) {
    console.error("❌ Error cambiando estado de usuario:", error);
    res.status(500).json({ message: "Error cambiando estado de usuario", error });
  }
};

// Reinvitar usuario
exports.reinvitar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { email } = req.body;

    const usuario = await prisma.usuario.findUnique({ where: { id } });

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Generar nuevo token
    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    // Actualizar usuario con nuevo token
    await prisma.usuario.update({
      where: { id },
      data: {
        activationToken: token,
        activationExpires: expires,
        email, // opcional: actualizar email si se cambió
      },
    });

    // Enviar correo
    await sendActivationEmail({
      to: email,
      name: usuario.nombre,
      token,
    });

    res.json({ message: "Invitación reenviada correctamente" });
  } catch (error) {
    console.error("❌ Error reinvitando usuario:", error);
    res.status(500).json({ message: "Error reinvitando usuario", error });
  }
};
