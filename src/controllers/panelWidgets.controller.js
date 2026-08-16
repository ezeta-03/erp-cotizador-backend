const prisma = require("../config/prisma");
const { KIND_HANDLERS } = require("./dashboard.controller");

// Acomodo por default la primera vez que un usuario abre su Inicio (antes de
// que haya guardado algo propio) — el mismo bento que ya conocían.
const DEFAULTS_BY_ROLE = {
  ADMIN: [
    { kind: "outdoor",  x: 0, y: 0, w: 2, h: 2 },
    { kind: "facturar", x: 2, y: 0, w: 1, h: 2 },
    { kind: "clientes", x: 3, y: 0, w: 1, h: 2 },
    { kind: "btl",      x: 0, y: 2, w: 1, h: 1 },
    { kind: "usuarios", x: 1, y: 2, w: 1, h: 1 },
    { kind: "dashboard", x: 2, y: 2, w: 1, h: 1 },
    { kind: "perfil",   x: 3, y: 2, w: 1, h: 1 },
  ],
  VENTAS: [
    { kind: "outdoor",  x: 0, y: 0, w: 2, h: 2 },
    { kind: "facturar", x: 2, y: 0, w: 1, h: 2 },
    { kind: "clientes", x: 3, y: 0, w: 1, h: 2 },
    { kind: "btl",      x: 0, y: 2, w: 1, h: 1 },
    { kind: "dashboard", x: 1, y: 2, w: 1, h: 1 },
    { kind: "perfil",   x: 2, y: 2, w: 1, h: 1 },
  ],
};

exports.listar = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const guardados = await prisma.panelWidget.findMany({ where: { usuarioId: userId } });
    if (guardados.length > 0) {
      return res.json(guardados.map(({ kind, x, y, w, h }) => ({ kind, x, y, w, h })));
    }
    res.json(DEFAULTS_BY_ROLE[role] ?? []);
  } catch (e) {
    res.status(500).json({ message: "Error al listar el panel de bienvenida", error: e.message });
  }
};

exports.guardar = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { widgets } = req.body;
    if (!Array.isArray(widgets)) {
      return res.status(400).json({ message: "widgets debe ser un arreglo" });
    }
    for (const w of widgets) {
      if (typeof w.kind !== "string" || !KIND_HANDLERS[w.kind]) {
        return res.status(400).json({ message: `Bloque inválido: ${w.kind}` });
      }
      if (![w.x, w.y, w.w, w.h].every((n) => Number.isInteger(n) && n >= 0)) {
        return res.status(400).json({ message: `Posición/tamaño inválido para ${w.kind}` });
      }
    }

    await prisma.$transaction([
      prisma.panelWidget.deleteMany({ where: { usuarioId: userId } }),
      ...widgets.map((w) =>
        prisma.panelWidget.create({
          data: { usuarioId: userId, kind: w.kind, x: w.x, y: w.y, w: w.w, h: w.h },
        })
      ),
    ]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Error al guardar el panel de bienvenida", error: e.message });
  }
};
