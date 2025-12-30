const prisma = require("../config/prisma");

// Crear cliente
exports.crear = async (req, res) => {
  try {
    const cliente = await prisma.cliente.create({
      data: req.body
    });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ message: "Error al crear cliente", error });
  }
};

// Listar clientes
exports.listar = async (req, res) => {
  try {
    const clientes = await prisma.cliente.findMany({
      orderBy: { id: "desc" }
    });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ message: "Error al listar clientes" });
  }
};

// Actualizar cliente
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;

    const cliente = await prisma.cliente.update({
      where: { id: Number(id) },
      data: req.body
    });

    res.json(cliente);
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar cliente" });
  }
};

// Eliminar cliente
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.cliente.delete({
      where: { id: Number(id) }
    });

    res.json({ message: "Cliente eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar cliente" });
  }
};
