const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { sendActivationEmail } = require("../services/mail.service");

const generarToken = () => {
  const token = crypto.randomUUID();
  const expires = new Date();
  expires.setHours(expires.getHours() + 24);
  return { token, expires };
};

const selectPublico = {
  id: true,
  nombre: true,
  email: true,
  role: true,
  activo: true,
  activationToken: true,
  createdAt: true,
};

// ── Crear usuario interno (ADMIN / VENTAS / CONTABLE) ────────────────────────
exports.crear = async (req, res) => {
  try {
    const { nombre, email, role } = req.body;

    if (!nombre || !email || !role) {
      return res.status(400).json({ message: "nombre, email y rol son obligatorios" });
    }

    if (role === "CLIENTE") {
      return res.status(400).json({ message: "Los clientes se gestionan desde la sección Clientes" });
    }

    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (existe) {
      return res.status(400).json({ message: "Ya existe un usuario con ese email" });
    }

    const { token, expires } = generarToken();

    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        role,
        activo: false,
        activationToken: token,
        activationExpires: expires,
      },
      select: selectPublico,
    });

    await prisma.usuarioLog.create({
      data: { usuarioId: usuario.id, evento: "INVITADO", realizadoPorId: req.user.id },
    });

    res.status(201).json(usuario);

    try {
      await sendActivationEmail({ to: email, name: nombre, token });
    } catch (mailErr) {
      console.error("❌ Error enviando email de activación:", mailErr.message);
    }
  } catch (error) {
    console.error("❌ Error creando usuario:", error.message);
    res.status(500).json({ message: "Error al crear usuario", error: error.message });
  }
};

// ── Listar usuarios internos (excluye CLIENTE) ───────────────────────────────
exports.listar = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { role: { not: "CLIENTE" } },
      orderBy: { id: "desc" },
      select: selectPublico,
    });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ message: "Error al listar usuarios", error: error.message });
  }
};

// ── Actualizar usuario interno ────────────────────────────────────────────────
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, email, password, role } = req.body;

    if (role === "CLIENTE") {
      return res.status(400).json({ message: "Los clientes se gestionan desde la sección Clientes" });
    }

    const data = { nombre, email, role };

    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data,
      select: selectPublico,
    });

    res.json(usuario);
  } catch (error) {
    console.error("❌ Error actualizando usuario:", error.message);
    res.status(500).json({ message: "Error al actualizar usuario", error: error.message });
  }
};

// ── Eliminar usuario (soft delete) ───────────────────────────────────────────
exports.eliminar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.usuario.update({ where: { id }, data: { activo: false } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar usuario", error: error.message });
  }
};

// ── Activar / desactivar usuario ─────────────────────────────────────────────
exports.cambiarEstado = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body;

    if (typeof activo === "undefined") {
      return res.status(400).json({ message: "Debe indicar el estado (activo: true/false)" });
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: { activo },
      select: selectPublico,
    });

    await prisma.usuarioLog.create({
      data: {
        usuarioId: id,
        evento: activo ? "ACTIVADO_ADMIN" : "DESACTIVADO",
        realizadoPorId: req.user.id,
      },
    });

    res.json(usuario);
  } catch (error) {
    res.status(500).json({ message: "Error cambiando estado de usuario", error: error.message });
  }
};

// ── Log de eventos de usuario ─────────────────────────────────────────────────
exports.listarLog = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const logs = await prisma.usuarioLog.findMany({
      where: { usuarioId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        realizadoPor: { select: { id: true, nombre: true } },
      },
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener log de usuario", error: error.message });
  }
};

// ── Reinvitar usuario (reenviar email de activación) ─────────────────────────
exports.reinvitar = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const emailDestino = req.body.email || usuario.email;
    const { token, expires } = generarToken();

    await prisma.usuario.update({
      where: { id },
      data: { email: emailDestino, activationToken: token, activationExpires: expires, activo: false },
    });

    await prisma.usuarioLog.create({
      data: { usuarioId: id, evento: "REINVITADO", realizadoPorId: req.user.id },
    });

    res.json({ message: "Invitación reenviada correctamente" });

    try {
      await sendActivationEmail({ to: emailDestino, name: usuario.nombre, token });
      console.log(`📧 Reinvitación enviada a ${emailDestino}`);
    } catch (mailErr) {
      console.error("❌ Error enviando reinvitación:", mailErr.message);
    }
  } catch (error) {
    res.status(500).json({ message: "Error reinvitando usuario", error: error.message });
  }
};
