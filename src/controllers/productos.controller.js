const prisma = require("../config/prisma");

// Crear producto
exports.crear = async (req, res) => {
  try {
    const producto = await prisma.producto.create({
      data: {
        nombre: req.body.nombre,
        precio_material: Number(req.body.precio_material),
        precio_mano_obra: Number(req.body.precio_mano_obra)
      }
    });

    res.json(producto);
  } catch (error) {
    res.status(500).json({ message: "Error al crear producto", error });
  }
};

// Listar productos
exports.listar = async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      orderBy: { id: "desc" }
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ message: "Error al listar productos" });
  }
};

// Actualizar producto
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;

    const producto = await prisma.producto.update({
      where: { id: Number(id) },
      data: {
        nombre: req.body.nombre,
        precio_material: Number(req.body.precio_material),
        precio_mano_obra: Number(req.body.precio_mano_obra)
      }
    });

    res.json(producto);
  } catch (error) {
    res.status(500).json({ message: "Error al actualizar producto" });
  }
};

// Eliminar producto
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.producto.delete({
      where: { id: Number(id) }
    });

    res.json({ message: "Producto eliminado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar producto" });
  }
};
