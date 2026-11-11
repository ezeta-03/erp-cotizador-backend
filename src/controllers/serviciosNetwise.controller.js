const prisma = require("../config/prisma");

const UNIDADES = ["servicio", "mes", "hora", "proyecto", "pieza"];

// Valida y normaliza lo que llega del formulario de servicios.
function leerServicio(body, parcial = false) {
  const data = {};
  const texto = (v) => (typeof v === "string" ? v.trim() : "");

  if (!parcial || body.nombre !== undefined) {
    if (!texto(body.nombre)) throw new Error("El nombre es obligatorio");
    data.nombre = texto(body.nombre);
  }
  if (!parcial || body.categoria !== undefined) {
    if (!texto(body.categoria)) throw new Error("La categoría es obligatoria");
    data.categoria = texto(body.categoria).toUpperCase();
  }
  if (!parcial || body.precio !== undefined) {
    const precio = Number(body.precio);
    if (!Number.isFinite(precio) || precio < 0) throw new Error("El precio debe ser un número mayor o igual a 0");
    data.precio = Math.round(precio * 100) / 100;
  }
  if (body.unidad !== undefined) {
    if (!UNIDADES.includes(body.unidad)) throw new Error("Unidad no válida");
    data.unidad = body.unidad;
  }
  if (body.descripcion !== undefined) data.descripcion = texto(body.descripcion) || null;
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  return data;
}

exports.listar = async (req, res) => {
  try {
    const where = req.query.todos === "1" ? {} : { activo: true };
    const servicios = await prisma.servicioNetwise.findMany({
      where,
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });
    res.json(servicios);
  } catch (error) {
    console.error("❌ Error listando servicios Netwise:", error);
    res.status(500).json({ message: "Error al listar servicios" });
  }
};

exports.crear = async (req, res) => {
  let data;
  try { data = leerServicio(req.body); } catch (e) { return res.status(400).json({ message: e.message }); }
  try {
    res.status(201).json(await prisma.servicioNetwise.create({ data }));
  } catch (error) {
    console.error("❌ Error creando servicio Netwise:", error);
    res.status(500).json({ message: "Error al crear servicio" });
  }
};

exports.actualizar = async (req, res) => {
  let data;
  try { data = leerServicio(req.body, true); } catch (e) { return res.status(400).json({ message: e.message }); }
  try {
    res.json(await prisma.servicioNetwise.update({ where: { id: Number(req.params.id) }, data }));
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Servicio no encontrado" });
    console.error("❌ Error actualizando servicio Netwise:", error);
    res.status(500).json({ message: "Error al actualizar servicio" });
  }
};

// Baja lógica: las cotizaciones que ya lo usan conservan su línea.
exports.eliminar = async (req, res) => {
  try {
    await prisma.servicioNetwise.update({ where: { id: Number(req.params.id) }, data: { activo: false } });
    res.json({ success: true });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Servicio no encontrado" });
    res.status(500).json({ message: "Error al eliminar servicio" });
  }
};
