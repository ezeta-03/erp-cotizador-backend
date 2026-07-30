const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MESES = [
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE",
];

const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const getEstadoContrato = (p) =>
  p.estadoOverride || (new Date(p.fin) >= new Date() ? "VIGENTE" : "VENCIDO");

const conCodigo = (p) => ({
  ...p,
  codigo: `PRV-${String(p.id).padStart(3, "0")}`,
  estadoContrato: getEstadoContrato(p),
});

// Meses de calendario entre dos fechas (mes de inicio inclusive, mes de fin
// exclusivo, mínimo 1 mes) — misma convención que Ocupación, para que un
// contrato corto dentro de un solo mes calendario no genere 0 cuotas.
const totalMesesEntre = (inicio, fin) => {
  const s = new Date(inicio);
  const e = new Date(fin);
  const inicioAbs = s.getUTCFullYear() * 12 + s.getUTCMonth();
  const finAbs = Math.max(inicioAbs + 1, e.getUTCFullYear() * 12 + e.getUTCMonth());
  return finAbs - inicioAbs;
};

const generarCuotas = (inicio, fin, costoMensual) => {
  const cuotas  = [];
  const start   = new Date(inicio);
  const igvRate = 0.18;
  const diaInicio = start.getUTCDate();
  const totalMeses = totalMesesEntre(inicio, fin);

  for (let i = 0; i < totalMeses; i++) {
    const current = new Date(start.getUTCFullYear(), start.getUTCMonth() + i, 1);
    const monto = parseFloat(Number(costoMensual).toFixed(2));
    const igv   = parseFloat((monto * igvRate).toFixed(2));
    cuotas.push({
      numero: i + 1,
      monto,
      igv,
      fecha:      `PRIMERA SEMANA ${MESES[current.getMonth()]} ${current.getFullYear()}`,
      fechaCobro: new Date(current.getFullYear(), current.getMonth(), diaInicio),
      estado:     "PENDIENTE",
      detalle:    null,
    });
  }
  return cuotas;
};

/* ── LISTAR ── */
exports.listar = async (req, res) => {
  try {
    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      include: { cuotas: { orderBy: { numero: "asc" } } },
      orderBy: { id: "asc" },
    });
    res.json(proveedores.map(conCodigo));
  } catch (e) {
    res.status(500).json({ message: "Error al listar proveedores", error: e.message });
  }
};

/* ── RESUMEN PAGOS POR MES desglosado por proveedor (dashboard) ── */
exports.resumenPagos = async (req, res) => {
  try {
    const anio = parseInt(req.query.anio) || new Date().getFullYear();
    const gte  = new Date(anio, 0, 1);
    const lt   = new Date(anio + 1, 0, 1);

    const [todasCuotas, proveedoresActivos] = await Promise.all([
      prisma.proveedorCuota.findMany({
        where: { fechaCobro: { gte, lt }, proveedor: { activo: true } },
        include: { proveedor: true },
      }),
      prisma.proveedor.findMany({
        where: { activo: true },
        select: { fin: true, estadoOverride: true },
      }),
    ]);

    const hoy = new Date();
    const totalProveedores = proveedoresActivos.length;
    const estadoConteo = { VIGENTE: 0, VENCIDO: 0, CANCELADO: 0, SUSPENDIDO: 0 };
    for (const p of proveedoresActivos) {
      const e = p.estadoOverride || (new Date(p.fin) >= hoy ? "VIGENTE" : "VENCIDO");
      estadoConteo[e] = (estadoConteo[e] || 0) + 1;
    }

    // Datos mensuales para el gráfico (solo PENDIENTE)
    const chartMap = new Map();
    for (const c of todasCuotas.filter(c => c.estado === "PENDIENTE")) {
      if (!chartMap.has(c.proveedorId)) {
        chartMap.set(c.proveedorId, {
          id: c.proveedorId,
          codigo:    `PRV-${String(c.proveedorId).padStart(3, "0")}`,
          ubicacion: c.proveedor.ubicacion,
          ciudad:    c.proveedor.ciudad,
          data:      Array(12).fill(0),
        });
      }
      const mes = new Date(c.fechaCobro).getMonth();
      chartMap.get(c.proveedorId).data[mes] += c.monto + c.igv;
    }

    // Resumen anual por proveedor (PENDIENTE + CANCELADO)
    const resumenMap = new Map();
    for (const c of todasCuotas) {
      if (!resumenMap.has(c.proveedorId)) {
        resumenMap.set(c.proveedorId, {
          id: c.proveedorId,
          codigo:    `PRV-${String(c.proveedorId).padStart(3, "0")}`,
          ubicacion: c.proveedor.ubicacion,
          ciudad:    c.proveedor.ciudad,
          pendiente:       0,
          cancelado:       0,
          cuotasPendiente: 0,
          cuotasCancelado: 0,
        });
      }
      const r     = resumenMap.get(c.proveedorId);
      const total = c.monto + c.igv;
      if (c.estado === "PENDIENTE") { r.pendiente += total; r.cuotasPendiente++; }
      if (c.estado === "CANCELADO") { r.cancelado += total; r.cuotasCancelado++; }
    }

    const datasets = [...chartMap.values()]
      .sort((a, b) => a.id - b.id)
      .map(d => ({ ...d, data: d.data.map(v => parseFloat(v.toFixed(2))) }));

    const resumen = [...resumenMap.values()]
      .sort((a, b) => a.id - b.id)
      .map(r => ({
        ...r,
        pendiente: parseFloat(r.pendiente.toFixed(2)),
        cancelado: parseFloat(r.cancelado.toFixed(2)),
      }));

    const totalPendiente = parseFloat(resumen.reduce((s, r) => s + r.pendiente, 0).toFixed(2));
    const totalCancelado = parseFloat(resumen.reduce((s, r) => s + r.cancelado, 0).toFixed(2));

    const meses = MESES_CORTOS.map((label, i) => ({ mes: i + 1, label }));
    res.json({
      anio, meses, datasets, resumen,
      totalPendiente, totalCancelado,
      totalProveedores, estadoConteo,
    });
  } catch (e) {
    res.status(500).json({ message: "Error al obtener resumen de pagos", error: e.message });
  }
};

/* ── ALERTAS: cuotas PENDIENTE en los próximos 15 días, con nivel de urgencia ── */
exports.alertas = async (req, res) => {
  try {
    const hoy    = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + 15);

    const cuotas = await prisma.proveedorCuota.findMany({
      where: {
        estado:     "PENDIENTE",
        fechaCobro: { gte: hoy, lte: limite },
        proveedor:  { activo: true },
      },
      include: { proveedor: true },
      orderBy: { fechaCobro: "asc" },
    });

    const umbralRojo = new Date(hoy);
    umbralRojo.setDate(umbralRojo.getDate() + 7);

    res.json(
      cuotas.map((c) => ({
        cuotaId:    c.id,
        numero:     c.numero,
        fechaCobro: c.fechaCobro,
        monto:      c.monto,
        igv:        c.igv,
        total:      parseFloat((c.monto + c.igv).toFixed(2)),
        urgencia:   new Date(c.fechaCobro) <= umbralRojo ? "ROJA" : "AMARILLA",
        proveedor: {
          id:        c.proveedor.id,
          codigo:    `PRV-${String(c.proveedor.id).padStart(3, "0")}`,
          nombre:    c.proveedor.nombre,
          ubicacion: c.proveedor.ubicacion,
          ciudad:    c.proveedor.ciudad,
        },
      }))
    );
  } catch (e) {
    res.status(500).json({ message: "Error al obtener alertas", error: e.message });
  }
};

/* ── CREAR ── */
exports.crear = async (req, res) => {
  try {
    const {
      nombre, ciudad, ubicacion, tipoContrato, elementos,
      inicio, fin, costoMensual, costoLuzMes,
      numeroCuenta, nombreCuenta, relevanciaComercial, razonSocial,
    } = req.body;

    const cuotas = generarCuotas(inicio, fin, costoMensual);

    const proveedor = await prisma.proveedor.create({
      data: {
        nombre, ciudad: ciudad || null, ubicacion, tipoContrato,
        elementos: elementos || null,
        inicio: new Date(inicio),
        fin:    new Date(fin),
        costoMensual:    Number(costoMensual),
        costoLuzMes:     Number(costoLuzMes || 0),
        numeroCuenta:    numeroCuenta || null,
        nombreCuenta:    nombreCuenta || null,
        relevanciaComercial: relevanciaComercial || "ALTO",
        razonSocial:     razonSocial || null,
        cuotas: { create: cuotas },
      },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    });

    res.status(201).json(conCodigo(proveedor));
  } catch (e) {
    res.status(500).json({ message: "Error al crear proveedor", error: e.message });
  }
};

/* ── ACTUALIZAR ── */
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, ciudad, ubicacion, tipoContrato, elementos,
      inicio, fin, costoMensual, costoLuzMes,
      numeroCuenta, nombreCuenta, relevanciaComercial, razonSocial,
    } = req.body;

    const provId     = Number(id);
    const newInicio  = new Date(inicio);
    const newFin     = new Date(fin);
    const newCosto   = Number(costoMensual);
    const igvRate    = 0.18;

    // Leer valores anteriores para detectar cambios
    const anterior = await prisma.proveedor.findUnique({
      where: { id: provId },
      select: { inicio: true, fin: true, costoMensual: true },
    });

    const proveedor = await prisma.proveedor.update({
      where: { id: provId },
      data: {
        nombre, ciudad: ciudad || null, ubicacion, tipoContrato,
        elementos: elementos || null,
        inicio: newInicio,
        fin:    new Date(fin),
        costoMensual:    newCosto,
        costoLuzMes:     Number(costoLuzMes || 0),
        numeroCuenta:    numeroCuenta || null,
        nombreCuenta:    nombreCuenta || null,
        relevanciaComercial: relevanciaComercial || "ALTO",
        razonSocial:     razonSocial || null,
      },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    });

    // Si cambió el inicio, el fin o el costo mensual, recalcular cuotas
    const inicioCambio = anterior && newInicio.getTime() !== new Date(anterior.inicio).getTime();
    const finCambio     = anterior && newFin.getTime() !== new Date(anterior.fin).getTime();
    const costoCambio  = anterior && newCosto !== anterior.costoMensual;

    if (inicioCambio || costoCambio) {
      const dia = newInicio.getUTCDate();
      for (const c of proveedor.cuotas) {
        const data = {};
        if (inicioCambio) {
          data.fechaCobro = new Date(Date.UTC(
            newInicio.getUTCFullYear(),
            newInicio.getUTCMonth() + (c.numero - 1),
            dia,
          ));
        }
        if (costoCambio) {
          data.monto = parseFloat(newCosto.toFixed(2));
          data.igv   = parseFloat((newCosto * igvRate).toFixed(2));
        }
        await prisma.proveedorCuota.update({ where: { id: c.id }, data });
      }
    }

    if (finCambio) {
      const nuevoTotal = totalMesesEntre(newInicio, newFin);
      const dia = newInicio.getUTCDate();

      if (nuevoTotal > proveedor.cuotas.length) {
        const nuevasCuotas = [];
        for (let n = proveedor.cuotas.length + 1; n <= nuevoTotal; n++) {
          const current = new Date(newInicio.getUTCFullYear(), newInicio.getUTCMonth() + (n - 1), 1);
          const monto = parseFloat(newCosto.toFixed(2));
          const igv = parseFloat((newCosto * igvRate).toFixed(2));
          nuevasCuotas.push({
            proveedorId: provId,
            numero: n,
            monto,
            igv,
            fecha: `PRIMERA SEMANA ${MESES[current.getMonth()]} ${current.getFullYear()}`,
            fechaCobro: new Date(current.getFullYear(), current.getMonth(), dia),
            estado: "PENDIENTE",
            detalle: null,
          });
        }
        await prisma.proveedorCuota.createMany({ data: nuevasCuotas });
      } else if (nuevoTotal < proveedor.cuotas.length) {
        // Solo se quitan cuotas sobrantes que sigan PENDIENTE (nunca una ya cancelada/pagada)
        const sobrantes = proveedor.cuotas.slice(nuevoTotal).filter((c) => c.estado === "PENDIENTE");
        if (sobrantes.length) {
          await prisma.proveedorCuota.deleteMany({ where: { id: { in: sobrantes.map((c) => c.id) } } });
        }
      }
    }

    if (inicioCambio || costoCambio || finCambio) {
      // Recargar con cuotas actualizadas
      const actualizado = await prisma.proveedor.findUnique({
        where: { id: provId },
        include: { cuotas: { orderBy: { numero: "asc" } } },
      });
      return res.json(conCodigo(actualizado));
    }

    res.json(conCodigo(proveedor));
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar proveedor", error: e.message });
  }
};

/* ── ACTUALIZAR CUOTA ── */
exports.actualizarCuota = async (req, res) => {
  try {
    const { cuotaId } = req.params;
    const { estado, detalle, fecha, fechaCobro } = req.body;

    const cuota = await prisma.proveedorCuota.update({
      where: { id: Number(cuotaId) },
      data: {
        ...(estado     !== undefined && { estado }),
        ...(detalle    !== undefined && { detalle: detalle || null }),
        ...(fecha      !== undefined && { fecha }),
        ...(fechaCobro !== undefined && { fechaCobro: fechaCobro ? new Date(fechaCobro) : null }),
      },
    });

    // Auto-sync estadoOverride del contrato cuando cambia el estado de una cuota
    if (estado !== undefined) {
      const [todasCuotas, prov] = await Promise.all([
        prisma.proveedorCuota.findMany({ where: { proveedorId: cuota.proveedorId } }),
        prisma.proveedor.findUnique({ where: { id: cuota.proveedorId }, select: { estadoOverride: true } }),
      ]);
      // No sobreescribir si el contrato está suspendido manualmente
      if (prov.estadoOverride !== "SUSPENDIDO") {
        const allCanceladas = todasCuotas.length > 0 && todasCuotas.every(c => c.estado === "CANCELADO");
        await prisma.proveedor.update({
          where: { id: cuota.proveedorId },
          data: { estadoOverride: allCanceladas ? "CANCELADO" : null },
        });
      }
    }

    res.json(cuota);
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar cuota", error: e.message });
  }
};

/* ── CAMBIAR ESTADO DE CONTRATO (manual) ── */
exports.cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!["SUSPENDIDO", "CANCELADO", null].includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }
    await prisma.proveedor.update({
      where: { id: Number(id) },
      data: { estadoOverride: estado },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Error al cambiar estado", error: e.message });
  }
};

/* ── ELIMINAR (soft) ── */
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.proveedor.update({ where: { id: Number(id) }, data: { activo: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Error al eliminar proveedor", error: e.message });
  }
};
