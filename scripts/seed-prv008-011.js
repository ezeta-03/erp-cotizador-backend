const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PROVEEDORES = [
  {
    id: 8, nombre: "BLANCA VERGARA", ciudad: "HUANCAYO",
    ubicacion: "AV. CORONEL SECADA 201",
    costoMensual: 2500, igv: 450,
  },
  {
    id: 9, nombre: "BLANCA VERGARA", ciudad: "HUANCAYO",
    ubicacion: "AV. LA MARINA CUADRA 01. PUCHANA",
    costoMensual: 1000, igv: 180,
  },
  {
    id: 10, nombre: "BLANCA VERGARA", ciudad: "HUANCAYO",
    ubicacion: "AV. MESONES MURO - FRENTE A MEGA PLAZA",
    costoMensual: 2500, igv: 450,
  },
  {
    id: 11, nombre: "BLANCA VERGARA", ciudad: "HUANCAYO",
    ubicacion: "CARRETERA IQUITOS NAUTA",
    costoMensual: 1000, igv: 180,
  },
];

const FECHAS_TEXTO = [
  "PRIMERA SEMANA MARZO 2026", "PRIMERA SEMANA ABRIL", "PRIMERA SEMANA MAYO",
  "PRIMERA SEMANA JUNIO", "PRIMERA SEMANA JULIO", "PRIMERA SEMANA AGOSTO",
  "PRIMERA SEMANA SETIEMBRE", "PRIMERA SEMANA OCTUBRE", "PRIMERA SEMANA NOVIEMBRE",
  "PRIMERA SEMANA DICIEMBRE", "PRIMERA SEMANA ENERO", "PRIMERA SEMANA FEBRERO",
];

function buildCuotas(monto, igv) {
  return FECHAS_TEXTO.map((fecha, i) => ({
    numero:    i + 1,
    monto,
    igv,
    fechaCobro: i === 0 ? new Date("2026-03-09") : null,
    estado:    i === 0 ? "CANCELADO" : "PENDIENTE",
    detalle:   i === 0 ? "TRANSFERENCIA" : i === 1 ? "PAGO EN EFECTIVO" : i === 11 ? "PAGO LUZ" : null,
    fecha,
  }));
}

async function main() {
  for (const p of PROVEEDORES) {
    const cuotas = buildCuotas(p.costoMensual, p.igv);

    await prisma.proveedor.update({
      where: { id: p.id },
      data: {
        nombre: p.nombre, ciudad: p.ciudad, ubicacion: p.ubicacion,
        tipoContrato: "ALQUILER ESTRUCTURA", elementos: "TORRE 10m X 5m",
        inicio: new Date("2026-03-12"), fin: new Date("2027-03-11"),
        costoMensual: p.costoMensual, costoLuzMes: 150,
        numeroCuenta: "0011-0237-0200450719", nombreCuenta: "BLANCA VERGARA",
        relevanciaComercial: "ALTO", razonSocial: null,
        estadoOverride: null, activo: true,
      },
    });

    await prisma.proveedorCuota.deleteMany({ where: { proveedorId: p.id } });
    for (const c of cuotas) {
      await prisma.proveedorCuota.create({ data: { proveedorId: p.id, ...c } });
    }

    const total = cuotas.reduce((s, c) => s + c.monto + c.igv, 0);
    const code  = `PRV-${String(p.id).padStart(3, "0")}`;
    console.log(`✓ ${code}  ${p.ubicacion}  | Total: S/ ${total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`);
  }

  console.log("\nTodos los proveedores cargados:");
  const todos = await prisma.proveedor.findMany({
    where: { activo: true },
    select: { id: true, ubicacion: true, costoMensual: true },
    orderBy: { id: "asc" },
  });
  todos.forEach((r) => {
    console.log(`  PRV-${String(r.id).padStart(3,"0")}  ${r.ubicacion}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
