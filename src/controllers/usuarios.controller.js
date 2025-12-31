const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");

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
        clienteId: role === "CLIENTE" ? clienteId : null
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        clienteId: true,
        activo: true,
        createdAt: true,
      }
    });

    res.json(usuario);
  } catch (error) {
    res.status(500).json({ message: "Error al crear usuario", error });
  }
};

// Listar usuarios activos (sin password)
exports.listar = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { activo: true },
      orderBy: { id: "desc" },
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        clienteId: true,
        activo: true,
        createdAt: true,
      }
    });
    res.json(usuarios);
  } catch (error) {
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
      }
    });

    res.json(usuario);
  } catch (error) {
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
      select: { id: true }
    });

    res.json({ success: true, id: usuario.id });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar usuario", error });
  }
};
