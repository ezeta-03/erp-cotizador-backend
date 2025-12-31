// src/controllers/stats.controller.js
const prisma = require("../config/prisma");

// Obtener estadísticas de cotizaciones por estado
exports.getEstadisticasCotizaciones = async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    const where = role === "VENTAS" ? { usuarioId: userId } : {};

    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      select: {
        estado: true,
        total: true,
      },
    });

    const stats = {
      PENDIENTE: { count: 0, total: 0 },
      APROBADA: { count: 0, total: 0 },
      RECHAZADA: { count: 0, total: 0 },
      FACTURADA: { count: 0, total: 0 },
    };

    cotizaciones.forEach((cot) => {
      stats[cot.estado].count++;
      stats[cot.estado].total += cot.total;
    });

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
};

// Obtener cotizaciones por día del mes actual
exports.getCotizacionesPorDia = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const where = {
      createdAt: {
        gte: firstDay,
        lte: lastDay,
      },
      ...(role === "VENTAS" && { usuarioId: userId }),
    };

    const cotizaciones = await prisma.cotizacion.findMany({
      where,
      select: {
        createdAt: true,
        estado: true,
        total: true,
      },
    });

    // Agrupar por día
    const diasDelMes = lastDay.getDate();
    const dataPorDia = Array.from({ length: diasDelMes }, (_, i) => ({
      dia: i + 1,
      enviadas: 0,
      aprobadas: 0,
      totalEnviadas: 0,
      totalAprobadas: 0,
    }));

    cotizaciones.forEach((cot) => {
      const dia = new Date(cot.createdAt).getDate();
      const index = dia - 1;

      // Contar enviadas (PENDIENTE + APROBADA + RECHAZADA + FACTURADA = todas)
      dataPorDia[index].enviadas++;
      dataPorDia[index].totalEnviadas += cot.total;

      // Contar aprobadas (APROBADA + FACTURADA)
      if (cot.estado === "APROBADA" || cot.estado === "FACTURADA") {
        dataPorDia[index].aprobadas++;
        dataPorDia[index].totalAprobadas += cot.total;
      }
    });

    res.json(dataPorDia);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener cotizaciones por día" });
  }
};

// Obtener meta mensual del vendedor
exports.getMetaMensual = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { vendedorId } = req.query;

    // Si es ADMIN y pasa vendedorId, obtener meta de ese vendedor
    // Si es VENTAS, obtener su propia meta
    const targetUserId = role === "ADMIN" && vendedorId ? parseInt(vendedorId) : userId;

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();

    let meta = await prisma.metaMensual.findUnique({
      where: {
        usuarioId_mes_anio: {
          usuarioId: targetUserId,
          mes,
          anio,
        },
      },
    });

    // Si no existe meta, retornar 0
    if (!meta) {
      return res.json({ monto: 0, mes, anio });
    }

    res.json(meta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener meta mensual" });
  }
};

// Crear o actualizar meta mensual (solo ADMIN)
exports.setMetaMensual = async (req, res) => {
  try {
    const { role } = req.user;

    if (role !== "ADMIN") {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { vendedorId, monto } = req.body;

    if (!vendedorId || monto === undefined) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();

    const meta = await prisma.metaMensual.upsert({
      where: {
        usuarioId_mes_anio: {
          usuarioId: vendedorId,
          mes,
          anio,
        },
      },
      update: { monto },
      create: {
        usuarioId: vendedorId,
        monto,
        mes,
        anio,
      },
    });

    res.json(meta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al establecer meta mensual" });
  }
};

// Obtener progreso vs meta (solo cotizaciones FACTURADAS)
exports.getProgresoMeta = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { vendedorId } = req.query;

    const targetUserId = role === "ADMIN" && vendedorId ? parseInt(vendedorId) : userId;

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();
    const firstDay = new Date(anio, mes - 1, 1);
    const lastDay = new Date(anio, mes, 0, 23, 59, 59);

    // Obtener meta
    const meta = await prisma.metaMensual.findUnique({
      where: {
        usuarioId_mes_anio: { usuarioId: targetUserId, mes, anio },
      },
    });

    // Obtener total facturado
    const cotizacionesFacturadas = await prisma.cotizacion.aggregate({
      where: {
        usuarioId: targetUserId,
        estado: "FACTURADA",
        createdAt: {
          gte: firstDay,
          lte: lastDay,
        },
      },
      _sum: { total: true },
    });

    const avance = cotizacionesFacturadas._sum.total || 0;
    const metaMonto = meta?.monto || 0;
    const porcentaje = metaMonto > 0 ? (avance / metaMonto) * 100 : 0;

    res.json({
      meta: metaMonto,
      avance,
      porcentaje: Math.min(porcentaje, 100),
      mes,
      anio,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener progreso" });
  }
};

// Obtener todos los vendedores con sus progresos (solo ADMIN)
exports.getProgresoTodosVendedores = async (req, res) => {
  try {
    const { role } = req.user;

    if (role !== "ADMIN") {
      return res.status(403).json({ error: "No autorizado" });
    }

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();
    const firstDay = new Date(anio, mes - 1, 1);
    const lastDay = new Date(anio, mes, 0, 23, 59, 59);

    // Obtener todos los vendedores activos
    const vendedores = await prisma.usuario.findMany({
      where: {
        role: "VENTAS",
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
      },
    });

    // Obtener metas y progresos
    const resultados = await Promise.all(
      vendedores.map(async (vendedor) => {
        const meta = await prisma.metaMensual.findUnique({
          where: {
            usuarioId_mes_anio: { usuarioId: vendedor.id, mes, anio },
          },
        });

        const cotizacionesFacturadas = await prisma.cotizacion.aggregate({
          where: {
            usuarioId: vendedor.id,
            estado: "FACTURADA",
            createdAt: { gte: firstDay, lte: lastDay },
          },
          _sum: { total: true },
        });

        const avance = cotizacionesFacturadas._sum.total || 0;
        const metaMonto = meta?.monto || 0;
        const porcentaje = metaMonto > 0 ? (avance / metaMonto) * 100 : 0;

        return {
          vendedorId: vendedor.id,
          vendedor: vendedor.nombre,
          email: vendedor.email,
          meta: metaMonto,
          avance,
          porcentaje: Math.min(porcentaje, 100),
        };
      })
    );

    // Calcular progreso general (suma de todos)
    const totalMeta = resultados.reduce((sum, v) => sum + v.meta, 0);
    const totalAvance = resultados.reduce((sum, v) => sum + v.avance, 0);
    const porcentajeGeneral = totalMeta > 0 ? (totalAvance / totalMeta) * 100 : 0;

    res.json({
      vendedores: resultados,
      general: {
        meta: totalMeta,
        avance: totalAvance,
        porcentaje: Math.min(porcentajeGeneral, 100),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener progresos" });
  }
};