// src/controllers/stats.controller.js
const prisma = require("../config/prisma");

// Obtener estadísticas de cotizaciones por estado
exports.getEstadisticasCotizaciones = async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    // Datos ficticios para desarrollo
    const stats = {
      PENDIENTE: { count: 12, total: 145000 },
      APROBADA: { count: 8, total: 98000 },
      RECHAZADA: { count: 3, total: 25000 },
      FACTURADA: { count: 15, total: 185000 },
    };

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
    
    // Datos ficticios para desarrollo
    const datosFicticios = [
      { dia: 1, enviadas: 2, aprobadas: 1, totalEnviadas: 15000, totalAprobadas: 8000 },
      { dia: 2, enviadas: 0, aprobadas: 0, totalEnviadas: 0, totalAprobadas: 0 },
      { dia: 3, enviadas: 3, aprobadas: 2, totalEnviadas: 22000, totalAprobadas: 18000 },
      { dia: 4, enviadas: 1, aprobadas: 1, totalEnviadas: 12000, totalAprobadas: 12000 },
      { dia: 5, enviadas: 4, aprobadas: 3, totalEnviadas: 35000, totalAprobadas: 28000 },
      { dia: 6, enviadas: 2, aprobadas: 1, totalEnviadas: 18000, totalAprobadas: 15000 },
      { dia: 7, enviadas: 0, aprobadas: 0, totalEnviadas: 0, totalAprobadas: 0 },
      { dia: 8, enviadas: 3, aprobadas: 2, totalEnviadas: 25000, totalAprobadas: 20000 },
      { dia: 9, enviadas: 1, aprobadas: 0, totalEnviadas: 9000, totalAprobadas: 0 },
      { dia: 10, enviadas: 5, aprobadas: 4, totalEnviadas: 42000, totalAprobadas: 38000 },
      { dia: 11, enviadas: 2, aprobadas: 2, totalEnviadas: 16000, totalAprobadas: 16000 },
      { dia: 12, enviadas: 0, aprobadas: 0, totalEnviadas: 0, totalAprobadas: 0 },
      { dia: 13, enviadas: 3, aprobadas: 1, totalEnviadas: 27000, totalAprobadas: 12000 },
      { dia: 14, enviadas: 1, aprobadas: 1, totalEnviadas: 11000, totalAprobadas: 11000 },
      { dia: 15, enviadas: 4, aprobadas: 3, totalEnviadas: 33000, totalAprobadas: 29000 },
      { dia: 16, enviadas: 2, aprobadas: 1, totalEnviadas: 19000, totalAprobadas: 14000 },
      { dia: 17, enviadas: 0, aprobadas: 0, totalEnviadas: 0, totalAprobadas: 0 },
      { dia: 18, enviadas: 3, aprobadas: 2, totalEnviadas: 24000, totalAprobadas: 21000 },
      { dia: 19, enviadas: 1, aprobadas: 1, totalEnviadas: 13000, totalAprobadas: 13000 }
    ];

    res.json(datosFicticios);
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

    // Datos ficticios para desarrollo
    const datosFicticios = {
      meta: 50000,
      avance: 35000,
      porcentaje: 70,
      mes: 1,
      anio: 2026,
    };

    res.json(datosFicticios);
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

    // Datos ficticios para desarrollo
    const datosFicticios = {
      vendedores: [
        {
          vendedorId: 1,
          vendedor: "Juan Pérez",
          email: "juan@ventas.com",
          meta: 50000,
          avance: 35000,
          porcentaje: 70
        },
        {
          vendedorId: 2,
          vendedor: "Ana García",
          email: "ana@ventas.com",
          meta: 45000,
          avance: 42000,
          porcentaje: 93.3
        },
        {
          vendedorId: 3,
          vendedor: "Pedro López",
          email: "pedro@ventas.com",
          meta: 55000,
          avance: 28000,
          porcentaje: 50.9
        }
      ],
      general: {
        meta: 150000,
        avance: 105000,
        porcentaje: 70
      }
    };

    res.json(datosFicticios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener progresos" });
  }
};