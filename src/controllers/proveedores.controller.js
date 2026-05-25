const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MESES = [
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE",
];

const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const conCodigo = (p) => ({ ...p, codigo: `PRV-${String(p.id).padStart(3, "0")}` });

const generarCuotas = (inicio, fin, costoMensual) => {
  const cuotas  = [];
  const start   = new Date(inicio);
  const end     = new Date(fin);
  const igvRate = 0.18;
  const diaInicio = start.getUTCDate();

  let current = new Date(start.getUTCFullYear(), start.getUTCMonth(), 1);
  let numero  = 1;

  while (current < new Date(end.getUTCFullYear(), end.getUTCMonth(), 1)) {
    const monto = parseFloat(Number(costoMensual).toFixed(2));
    const igv   = parseFloat((monto * igvRate).toFixed(2));
    cuotas.push({
      numero,
      monto,
      igv,
      fecha:      `PRIMERA SEMANA ${MESES[current.getMonth()]} ${current.getFullYear()}`,
      fechaCobro: new Date(current.getFullYear(), current.getMonth(), diaInicio),
      estado:     "PENDIENTE",
      detalle:    null,
    });
    current.setMonth(current.getMonth() + 1);
    numero++;
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

    const cuotas = await prisma.proveedorCuota.findMany({
      where: {
        estado:    "PENDIENTE",
        fechaCobro: {
          gte: new Date(anio, 0, 1),
          lt:  new Date(anio + 1, 0, 1),
        },
      },
      include: { proveedor: true },
    });

    // Agrupa por proveedor, acumula total por mes (0-based)
    const provsMap = new Map();
    for (const c of cuotas) {
      if (!provsMap.has(c.proveedorId)) {
        provsMap.set(c.proveedorId, {
          id:       c.proveedorId,
          codigo:   `PRV-${String(c.proveedorId).padStart(3, "0")}`,
          ubicacion: c.proveedor.ubicacion,
          ciudad:   c.proveedor.ciudad,
          data:     Array(12).fill(0),
        });
      }
      const mes = new Date(c.fechaCobro).getMonth();
      provsMap.get(c.proveedorId).data[mes] += c.monto + c.igv;
    }

    const datasets = [...provsMap.values()]
      .sort((a, b) => a.id - b.id)
      .map((d) => ({ ...d, data: d.data.map((v) => parseFloat(v.toFixed(2))) }));

    const meses = MESES_CORTOS.map((label, i) => ({ mes: i + 1, label }));

    res.json({ anio, meses, datasets });
  } catch (e) {
    res.status(500).json({ message: "Error al obtener resumen de pagos", error: e.message });
  }
};

/* ── ALERTAS: cuotas PENDIENTE con fechaCobro en los próximos 7 días ── */
exports.alertas = async (req, res) => {
  try {
    const hoy    = new Date();
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + 7);

    const cuotas = await prisma.proveedorCuota.findMany({
      where: {
        estado:    "PENDIENTE",
        fechaCobro: { gte: hoy, lte: limite },
      },
      include: { proveedor: true },
      orderBy: { fechaCobro: "asc" },
    });

    res.json(
      cuotas.map((c) => ({
        cuotaId:    c.id,
        numero:     c.numero,
        fechaCobro: c.fechaCobro,
        monto:      c.monto,
        igv:        c.igv,
        total:      parseFloat((c.monto + c.igv).toFixed(2)),
        proveedor: {
          id:       c.proveedor.id,
          codigo:   `PRV-${String(c.proveedor.id).padStart(3, "0")}`,
          nombre:   c.proveedor.nombre,
          ubicacion: c.proveedor.ubicacion,
          ciudad:   c.proveedor.ciudad,
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

    const proveedor = await prisma.proveedor.update({
      where: { id: Number(id) },
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
      },
      include: { cuotas: { orderBy: { numero: "asc" } } },
    });

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
    res.json(cuota);
  } catch (e) {
    res.status(500).json({ message: "Error al actualizar cuota", error: e.message });
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
