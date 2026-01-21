// src/controllers/stats.controller.js
const prisma = require("../config/prisma");

// Obtener estadísticas de cotizaciones por estado
exports.getEstadisticasCotizaciones = async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    // Filtro según rol
    const whereClause = role === "VENTAS" 
      ? { vendedorId: userId }
      : {};

    // Agrupar cotizaciones por estado
    const cotizaciones = await prisma.cotizacion.findMany({
      where: whereClause,
      select: {
        estado: true,
        total: true,
      },
    });

    // Calcular estadísticas por estado
    const stats = {
      PENDIENTE: { count: 0, total: 0 },
      APROBADA: { count: 0, total: 0 },
      RECHAZADA: { count: 0, total: 0 },
      FACTURADA: { count: 0, total: 0 },
    };

    cotizaciones.forEach((c) => {
      if (stats[c.estado]) {
        stats[c.estado].count++;
        stats[c.estado].total += c.total;
      }
    });

    res.json(stats);
  } catch (error) {
    console.error("Error en getEstadisticasCotizaciones:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
};

// Obtener cotizaciones por día del mes actual
exports.getCotizacionesPorDia = async (req, res) => {
  try {
    console.log('📊 Obteniendo cotizaciones por día para user:', req.user);

    const { role, id: userId } = req.user;

    // Obtener primer y último día del mes actual
    const now = new Date();
    const primerDia = new Date(now.getFullYear(), now.getMonth(), 1);
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Filtro según rol
    const whereClause = {
      createdAt: {
        gte: primerDia,
        lte: ultimoDia,
      },
      ...(role === "VENTAS" ? { vendedorId: userId } : {}),
    };

    // Obtener todas las cotizaciones del mes
    const cotizaciones = await prisma.cotizacion.findMany({
      where: whereClause,
      select: {
        createdAt: true,
        estado: true,
        total: true,
      },
    });

    // Agrupar por día
    const diasDelMes = ultimoDia.getDate();
    const datosPorDia = [];

    for (let dia = 1; dia <= diasDelMes; dia++) {
      const cotizacionesDelDia = cotizaciones.filter((c) => {
        return c.createdAt.getDate() === dia;
      });

      const enviadas = cotizacionesDelDia.length;
      const aprobadas = cotizacionesDelDia.filter(
        (c) => c.estado === "APROBADA" || c.estado === "FACTURADA"
      ).length;

      const totalEnviadas = cotizacionesDelDia.reduce(
        (sum, c) => sum + c.total,
        0
      );
      const totalAprobadas = cotizacionesDelDia
        .filter((c) => c.estado === "APROBADA" || c.estado === "FACTURADA")
        .reduce((sum, c) => sum + c.total, 0);

      datosPorDia.push({
        dia,
        enviadas,
        aprobadas,
        totalEnviadas,
        totalAprobadas,
      });
    }

    console.log('✅ Cotizaciones por día calculadas:', datosPorDia.length, 'días');
    res.json(datosPorDia);
  } catch (error) {
    console.error("Error en getCotizacionesPorDia:", error);
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
    console.error("Error en getMetaMensual:", error);
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
    console.error("Error en setMetaMensual:", error);
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

    // Obtener meta del mes
    const meta = await prisma.metaMensual.findUnique({
      where: {
        usuarioId_mes_anio: {
          usuarioId: targetUserId,
          mes,
          anio,
        },
      },
    });

    const montoMeta = meta?.monto || 0;

    // Obtener total facturado del mes
    const primerDia = new Date(anio, mes - 1, 1);
    const ultimoDia = new Date(anio, mes, 0);

    const cotizacionesFacturadas = await prisma.cotizacion.findMany({
      where: {
        vendedorId: targetUserId,
        estado: "FACTURADA",
        createdAt: {
          gte: primerDia,
          lte: ultimoDia,
        },
      },
      select: {
        total: true,
      },
    });

    const avance = cotizacionesFacturadas.reduce((sum, c) => sum + c.total, 0);
    const porcentaje = montoMeta > 0 ? (avance / montoMeta) * 100 : 0;

    res.json({
      meta: montoMeta,
      avance,
      porcentaje,
      mes,
      anio,
    });
  } catch (error) {
    console.error("Error en getProgresoMeta:", error);
    res.status(500).json({ error: "Error al obtener progreso" });
  }
};

// Obtener todos los vendedores con sus progresos (solo ADMIN)
exports.getProgresoTodosVendedores = async (req, res) => {
  try {
    console.log('📊 Obteniendo progreso de todos los vendedores');

    const now = new Date();
    const mes = now.getMonth() + 1;
    const anio = now.getFullYear();

    // Obtener todos los vendedores
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

    // Obtener primer y último día del mes
    const primerDia = new Date(anio, mes - 1, 1);
    const ultimoDia = new Date(anio, mes, 0);

    // Para cada vendedor, calcular su progreso
    const vendedoresConProgreso = await Promise.all(
      vendedores.map(async (vendedor) => {
        // Obtener meta
        const meta = await prisma.metaMensual.findUnique({
          where: {
            usuarioId_mes_anio: {
              usuarioId: vendedor.id,
              mes,
              anio,
            },
          },
        });

        const montoMeta = meta?.monto || 0;

        // Obtener cotizaciones facturadas
        const cotizacionesFacturadas = await prisma.cotizacion.findMany({
          where: {
            vendedorId: vendedor.id,
            estado: "FACTURADA",
            createdAt: {
              gte: primerDia,
              lte: ultimoDia,
            },
          },
          select: {
            total: true,
          },
        });

        const avance = cotizacionesFacturadas.reduce((sum, c) => sum + c.total, 0);
        const porcentaje = montoMeta > 0 ? (avance / montoMeta) * 100 : 0;

        return {
          vendedorId: vendedor.id,
          vendedor: vendedor.nombre,
          email: vendedor.email,
          meta: montoMeta,
          avance,
          porcentaje,
        };
      })
    );

    // Calcular totales generales
    const metaTotal = vendedoresConProgreso.reduce((sum, v) => sum + v.meta, 0);
    const avanceTotal = vendedoresConProgreso.reduce((sum, v) => sum + v.avance, 0);
    const porcentajeGeneral = metaTotal > 0 ? (avanceTotal / metaTotal) * 100 : 0;

    const resultado = {
      vendedores: vendedoresConProgreso,
      general: {
        meta: metaTotal,
        avance: avanceTotal,
        porcentaje: porcentajeGeneral,
      },
    };

    console.log('✅ Progreso calculado:', resultado);
    res.json(resultado);
  } catch (error) {
    console.error("Error en getProgresoTodosVendedores:", error);
    res.status(500).json({ error: "Error al obtener progresos" });
  }
};