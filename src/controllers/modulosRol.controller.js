const prisma = require("../config/prisma");

// Módulos que el Admin puede prender/apagar por rol. El orden es el del menú.
// Mantener sincronizado con src/constants/modulos.js del frontend.
const MODULOS_POR_ROL = {
  VENTAS: ["dashboard", "clientes", "facturar", "almacen", "proyectos", "outdoor", "btl"],
  CONTABLE: ["dashboard", "almacen", "proyectos", "facturar"],
};

async function habilitadosPorRol() {
  const filas = await prisma.modulosRol.findMany();
  const guardados = new Map(filas.map((f) => [f.rol, f.modulos]));
  return Object.fromEntries(
    Object.entries(MODULOS_POR_ROL).map(([rol, todos]) => [
      rol,
      // Sin fila = todos; con fila, solo los que siguen existiendo.
      guardados.has(rol) ? todos.filter((m) => guardados.get(rol).includes(m)) : todos,
    ])
  );
}

exports.MODULOS_POR_ROL = MODULOS_POR_ROL;

// Cualquier usuario logueado lo necesita para armar su menú.
exports.obtener = async (req, res) => {
  try {
    res.json({ disponibles: MODULOS_POR_ROL, habilitados: await habilitadosPorRol() });
  } catch (error) {
    console.error("❌ Error al obtener módulos por rol:", error);
    res.status(500).json({ message: "Error al obtener los módulos por rol" });
  }
};

exports.actualizar = async (req, res) => {
  try {
    const rol = String(req.params.rol || "").toUpperCase();
    const disponibles = MODULOS_POR_ROL[rol];
    if (!disponibles) return res.status(400).json({ message: "Rol sin módulos configurables" });

    const { modulos } = req.body;
    if (!Array.isArray(modulos)) return res.status(400).json({ message: "Se esperaba la lista de módulos" });
    const limpios = disponibles.filter((m) => modulos.includes(m));
    if (limpios.length === 0) return res.status(400).json({ message: "El rol debe tener al menos un módulo habilitado" });

    await prisma.modulosRol.upsert({
      where: { rol },
      create: { rol, modulos: limpios },
      update: { modulos: limpios },
    });
    res.json({ disponibles: MODULOS_POR_ROL, habilitados: await habilitadosPorRol() });
  } catch (error) {
    console.error("❌ Error al actualizar módulos por rol:", error);
    res.status(500).json({ message: "Error al actualizar los módulos por rol" });
  }
};
