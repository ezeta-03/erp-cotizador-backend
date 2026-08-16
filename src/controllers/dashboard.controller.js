const prisma = require("../config/prisma");
const { calcularFilasYResumen } = require("./rentabilidad.controller");

// Resumen para el panel de bienvenida: una cifra clave por sección, no el detalle
// completo de cada módulo (eso ya vive en sus propias pantallas).
exports.resumen = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const esVentas = role === "VENTAS";
    const scopeVentas = esVentas ? { usuarioId: userId } : {};

    const [porEstadoPanel, { resumen: rentabilidad }, cotizacionesFacturar, clientesActivos, usuariosActivos, cotizacionesBtl] =
      await Promise.all([
        prisma.panel.groupBy({ by: ["estado"], where: { activo: true }, _count: true }),
        calcularFilasYResumen(),
        prisma.cotizacion.findMany({
          where: { estado: "APROBADA", ...scopeVentas },
          select: { total: true },
        }),
        prisma.cliente.count({ where: { activo: true } }),
        esVentas ? Promise.resolve(null) : prisma.usuario.count({ where: { activo: true, role: { not: "CLIENTE" } } }),
        prisma.cotizacion.findMany({
          where: {
            estado: { in: ["PENDIENTE", "RENEGOCIACION"] },
            items: { none: { panelId: { not: null } } },
            ...scopeVentas,
          },
          select: { id: true },
        }),
      ]);

    const ocupados = porEstadoPanel
      .filter((g) => g.estado === "OCUPADO" || g.estado === "OCUPADO_EXTERNO")
      .reduce((s, g) => s + g._count, 0);
    const totalPaneles = porEstadoPanel.reduce((s, g) => s + g._count, 0);

    res.json({
      outdoor: {
        ocupados,
        total: totalPaneles,
        utilidadMes: rentabilidad.utilidadMensualMes2,
      },
      facturar: {
        pendientes: cotizacionesFacturar.length,
        monto: parseFloat(cotizacionesFacturar.reduce((s, c) => s + c.total, 0).toFixed(2)),
      },
      clientes: { activos: clientesActivos },
      usuarios: usuariosActivos !== null ? { activos: usuariosActivos } : null,
      btl: { enCurso: cotizacionesBtl.length },
    });
  } catch (e) {
    res.status(500).json({ message: "Error al calcular resumen del dashboard", error: e.message });
  }
};
