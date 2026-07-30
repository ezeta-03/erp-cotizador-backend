const prisma = require("../config/prisma");

// VENTAS/ADMIN: crear solicitud de margen reducido
exports.crear = async (req, res) => {
  try {
    const { margenSolicitado, comentario, clienteId } = req.body;

    if (margenSolicitado === undefined || !comentario?.trim()) {
      return res.status(400).json({ message: "Margen y comentario son requeridos" });
    }
    if (!clienteId) {
      return res.status(400).json({ message: "Selecciona un cliente antes de solicitar el margen" });
    }
    if (Number(margenSolicitado) >= 30) {
      return res.status(400).json({ message: "El margen solicitado debe ser menor a 30%" });
    }
    if (Number(margenSolicitado) < 0) {
      return res.status(400).json({ message: "El margen no puede ser negativo" });
    }

    const solicitud = await prisma.solicitudMargen.create({
      data: {
        usuarioId: req.user.id,
        clienteId: parseInt(clienteId),
        margenSolicitado: Number(margenSolicitado),
        comentario: comentario.trim(),
        estado: "PENDIENTE",
      },
      include: {
        usuario: { select: { nombre: true, email: true } },
        cliente: { select: { nombreComercial: true } },
      },
    });

    res.status(201).json(solicitud);
  } catch (error) {
    console.error("❌ Error creando solicitud de margen:", error);
    res.status(500).json({ message: "Error creando solicitud" });
  }
};

// ADMIN: listar solicitudes (default: PENDIENTE)
exports.listar = async (req, res) => {
  try {
    const { estado } = req.query;
    const where = estado && estado !== "TODAS" ? { estado } : {};

    const solicitudes = await prisma.solicitudMargen.findMany({
      where,
      include: {
        usuario: { select: { id: true, nombre: true, email: true } },
        aprobadaPor: { select: { id: true, nombre: true } },
        cliente: { select: { id: true, nombreComercial: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(solicitudes);
  } catch (error) {
    console.error("❌ Error listando solicitudes:", error);
    res.status(500).json({ message: "Error listando solicitudes" });
  }
};

// VENTAS/ADMIN: ver las propias solicitudes aprobadas (no usadas) para un cliente
// específico — el alcance es siempre por cliente, para que una aprobación de un
// caso puntual no se "filtre" y se use en una cotización de otro cliente.
exports.misAprobadas = async (req, res) => {
  try {
    const clienteId = parseInt(req.query.clienteId);
    if (!clienteId) return res.json([]);

    const solicitudes = await prisma.solicitudMargen.findMany({
      where: { usuarioId: req.user.id, clienteId, estado: "APROBADA" },
      orderBy: { margenSolicitado: "asc" },
    });
    res.json(solicitudes);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo solicitudes aprobadas" });
  }
};

// ADMIN: aprobar
exports.aprobar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const solicitud = await prisma.solicitudMargen.update({
      where: { id },
      data: {
        estado: "APROBADA",
        aprobadaPorId: req.user.id,
        resolvedAt: new Date(),
      },
      include: {
        usuario: { select: { nombre: true } },
        aprobadaPor: { select: { nombre: true } },
      },
    });
    res.json(solicitud);
  } catch (error) {
    console.error("❌ Error aprobando solicitud:", error);
    res.status(500).json({ message: "Error aprobando solicitud" });
  }
};

// ADMIN: rechazar
exports.rechazar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { motivo } = req.body;

    if (!motivo?.trim()) {
      return res.status(400).json({ message: "El motivo de rechazo es requerido" });
    }

    const solicitud = await prisma.solicitudMargen.update({
      where: { id },
      data: {
        estado: "RECHAZADA",
        aprobadaPorId: req.user.id,
        resolvedAt: new Date(),
        motivoRechazo: motivo.trim(),
      },
      include: {
        usuario: { select: { nombre: true } },
        aprobadaPor: { select: { nombre: true } },
      },
    });
    res.json(solicitud);
  } catch (error) {
    console.error("❌ Error rechazando solicitud:", error);
    res.status(500).json({ message: "Error rechazando solicitud" });
  }
};
