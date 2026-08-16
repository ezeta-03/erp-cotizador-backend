const prisma = require("../config/prisma");
const { calcularFilasYResumen } = require("./rentabilidad.controller");

const EN_7_DIAS = () => {
  const hoy = new Date();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + 7);
  return { hoy, limite };
};

// Un handler por bloque pineable ("kind"). Reciben { role, userId } y devuelven
// el objeto que ese bloque necesita para pintarse — cada uno es independiente,
// así que agregar un bloque nuevo no toca a los demás.
const KIND_HANDLERS = {
  outdoor: async () => {
    const [porEstado, { resumen }] = await Promise.all([
      prisma.panel.groupBy({ by: ["estado"], where: { activo: true }, _count: true }),
      calcularFilasYResumen(),
    ]);
    const ocupados = porEstado.filter((g) => g.estado === "OCUPADO" || g.estado === "OCUPADO_EXTERNO").reduce((s, g) => s + g._count, 0);
    const total = porEstado.reduce((s, g) => s + g._count, 0);
    return { ocupados, total, utilidadMes: resumen.utilidadMensualMes2 };
  },

  "outdoor.paneles": async () => {
    const porEstado = await prisma.panel.groupBy({ by: ["estado"], where: { activo: true, tipo: { not: "MUPI" } }, _count: true });
    const ocupados = porEstado.filter((g) => g.estado === "OCUPADO" || g.estado === "OCUPADO_EXTERNO").reduce((s, g) => s + g._count, 0);
    const total = porEstado.reduce((s, g) => s + g._count, 0);
    return { ocupados, total };
  },

  "outdoor.mupis": async () => {
    const porEstado = await prisma.panel.groupBy({ by: ["estado"], where: { activo: true, tipo: "MUPI" }, _count: true });
    const ocupados = porEstado.filter((g) => g.estado === "OCUPADO" || g.estado === "OCUPADO_EXTERNO").reduce((s, g) => s + g._count, 0);
    const total = porEstado.reduce((s, g) => s + g._count, 0);
    return { ocupados, total };
  },

  "outdoor.proveedores": async () => {
    const [total, pendientes] = await Promise.all([
      prisma.proveedor.count({ where: { activo: true } }),
      prisma.proveedorCuota.aggregate({
        where: { estado: "PENDIENTE", proveedor: { activo: true } },
        _sum: { monto: true, igv: true },
      }),
    ]);
    const porPagar = (pendientes._sum.monto ?? 0) + (pendientes._sum.igv ?? 0);
    return { total, porPagar: parseFloat(porPagar.toFixed(2)) };
  },

  "outdoor.ocupacion": async () => {
    const { hoy, limite } = EN_7_DIAS();
    const [activas, porVencer] = await Promise.all([
      prisma.reserva.count({ where: { activo: true, estado: { notIn: ["LIBRE", "LIBRE_EXTERNO"] } } }),
      prisma.reserva.count({ where: { activo: true, estado: { notIn: ["LIBRE", "LIBRE_EXTERNO"] }, fechaFin: { gte: hoy, lte: limite } } }),
    ]);
    return { activas, porVencer };
  },

  "outdoor.rentabilidad": async () => {
    const { resumen } = await calcularFilasYResumen();
    return { utilidadMes: resumen.utilidadMensualMes2, margen: resumen.margenPromedioMes2 };
  },

  "outdoor.cotizador": async ({ role, userId }) => {
    const scope = role === "VENTAS" ? { usuarioId: userId } : {};
    const cotizaciones = await prisma.cotizacion.findMany({
      where: { estado: { in: ["PENDIENTE", "RENEGOCIACION"] }, items: { some: { panelId: { not: null } } }, ...scope },
      select: { total: true },
    });
    return { pendientes: cotizaciones.length, monto: parseFloat(cotizaciones.reduce((s, c) => s + c.total, 0).toFixed(2)) };
  },

  facturar: async ({ role, userId }) => {
    const scope = role === "VENTAS" ? { usuarioId: userId } : {};
    const cotizaciones = await prisma.cotizacion.findMany({ where: { estado: "APROBADA", ...scope }, select: { total: true } });
    return { pendientes: cotizaciones.length, monto: parseFloat(cotizaciones.reduce((s, c) => s + c.total, 0).toFixed(2)) };
  },

  clientes: async () => {
    const desde = new Date(Date.now() - 7 * 86400000);
    const [activos, nuevos] = await Promise.all([
      prisma.cliente.count({ where: { activo: true } }),
      prisma.cliente.count({ where: { activo: true, createdAt: { gte: desde } } }),
    ]);
    return { activos, nuevos };
  },

  usuarios: async () => {
    const desde = new Date(Date.now() - 7 * 86400000);
    const [activos, nuevos] = await Promise.all([
      prisma.usuario.count({ where: { activo: true, role: { not: "CLIENTE" } } }),
      prisma.usuario.count({ where: { activo: true, role: { not: "CLIENTE" }, createdAt: { gte: desde } } }),
    ]);
    return { activos, nuevos };
  },

  btl: async ({ role, userId }) => {
    const scope = role === "VENTAS" ? { usuarioId: userId } : {};
    const cotizaciones = await prisma.cotizacion.findMany({
      where: { estado: { in: ["PENDIENTE", "RENEGOCIACION"] }, items: { none: { panelId: { not: null } } }, ...scope },
      select: { total: true },
    });
    return { enCurso: cotizaciones.length, monto: parseFloat(cotizaciones.reduce((s, c) => s + c.total, 0).toFixed(2)) };
  },

  "btl.cotizador": async (ctx) => KIND_HANDLERS.btl(ctx),

  "btl.productos": async () => ({ activos: await prisma.producto.count({ where: { activo: true } }) }),

  dashboard: async () => ({}),
  perfil: async () => ({}),
};

exports.KIND_HANDLERS = KIND_HANDLERS;

// Devuelve el resumen de exactamente los kinds pedidos (?kinds=a,b,c), no todos —
// así un usuario con pocos bloques pineados no paga el costo de calcular el resto.
// Los handlers corren de a pocos a la vez (no todos con Promise.all): cada uno ya
// abre 1-2 consultas propias, así que pedir muchos kinds a la vez podía disparar
// más conexiones simultáneas que las que el pool de Supabase permite.
const LOTE = 3;

exports.resumen = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const kinds = String(req.query.kinds || "")
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k && KIND_HANDLERS[k]);

    const resultado = {};
    for (let i = 0; i < kinds.length; i += LOTE) {
      const grupo = kinds.slice(i, i + LOTE);
      const valores = await Promise.all(grupo.map((k) => KIND_HANDLERS[k]({ role, userId })));
      grupo.forEach((k, idx) => { resultado[k] = valores[idx]; });
    }

    res.json(resultado);
  } catch (e) {
    res.status(500).json({ message: "Error al calcular resumen del dashboard", error: e.message });
  }
};
