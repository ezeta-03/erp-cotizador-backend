const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MESES = [
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE",
];

const conCodigo = (p) => ({ ...p, codigo: `PRV-${String(p.id).padStart(3, "0")}` });

const generarCuotas = (inicio, fin, costoMensual) => {
  const cuotas = [];
  const start = new Date(inicio);
  const end   = new Date(fin);
  const igvRate = 0.18;

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  let numero  = 1;

  while (current <= end) {
    const monto = parseFloat(Number(costoMensual).toFixed(2));
    const igv   = parseFloat((monto * igvRate).toFixed(2));
    cuotas.push({
      numero,
      monto,
      igv,
      fecha: `PRIMERA SEMANA ${MESES[current.getMonth()]} ${current.getFullYear()}`,
      estado: "PENDIENTE",
      detalle: null,
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
    const { estado, detalle, fecha } = req.body;

    const cuota = await prisma.proveedorCuota.update({
      where: { id: Number(cuotaId) },
      data: {
        ...(estado  !== undefined && { estado }),
        ...(detalle !== undefined && { detalle: detalle || null }),
        ...(fecha   !== undefined && { fecha }),
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
