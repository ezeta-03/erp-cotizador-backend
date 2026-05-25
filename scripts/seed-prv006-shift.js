const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PROVEEDOR_ID = 6;

const cuotasData = [
  { numero: 1,  monto: 1800, igv: 324, fechaCobro: new Date("2026-03-09"), estado: "CANCELADO", detalle: "TRANSFERENCIA",   fecha: "PRIMERA SEMANA MARZO 2026" },
  { numero: 2,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: "PAGO EN EFECTIVO", fecha: "PRIMERA SEMANA ABRIL" },
  { numero: 3,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA MAYO" },
  { numero: 4,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA JUNIO" },
  { numero: 5,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA JULIO" },
  { numero: 6,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA AGOSTO" },
  { numero: 7,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA SETIEMBRE" },
  { numero: 8,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA OCTUBRE" },
  { numero: 9,  monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA NOVIEMBRE" },
  { numero: 10, monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA DICIEMBRE" },
  { numero: 11, monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA ENERO" },
  { numero: 12, monto: 1800, igv: 324, fechaCobro: null, estado: "PENDIENTE", detalle: "PAGO LUZ", fecha: "PRIMERA SEMANA FEBRERO" },
];

// Fecha de inicio "base" para los placeholders
const INICIO_BASE = new Date("2026-03-12");
const FIN_BASE    = new Date("2027-03-11");

async function main() {
  // ── 1. Restaurar PRV-011 como placeholder (estaba borrado) ──────────────
  console.log("Restaurando PRV-011 como placeholder...");
  await prisma.proveedor.update({
    where: { id: 11 },
    data: {
      nombre:              "PROVEEDOR PENDIENTE",
      ciudad:              "HUANCAYO",
      ubicacion:           "PENDIENTE DE CARGA",
      tipoContrato:        "ALQUILER",
      elementos:           null,
      inicio:              INICIO_BASE,
      fin:                 FIN_BASE,
      costoMensual:        0,
      costoLuzMes:         0,
      numeroCuenta:        null,
      nombreCuenta:        null,
      relevanciaComercial: "ALTO",
      razonSocial:         null,
      estadoOverride:      null,
      activo:              true,
    },
  });
  // Limpiar cuotas del PRV-011
  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: 11 } });
  console.log("  ✓ PRV-011 restaurado y limpio");

  // ── 2. Cargar datos reales en PRV-006 ────────────────────────────────────
  console.log("\nActualizando PRV-006...");
  await prisma.proveedor.update({
    where: { id: PROVEEDOR_ID },
    data: {
      nombre:              "BLANCA VERGARA",
      ciudad:              "HUANCAYO",
      ubicacion:           "AV. MARIATEGUI Y REAL",
      tipoContrato:        "ALQUILER ESTRUCTURA",
      elementos:           "TORRE 10m X 5m",
      inicio:              INICIO_BASE,
      fin:                 FIN_BASE,
      costoMensual:        1800,
      costoLuzMes:         150,
      numeroCuenta:        "0011-0237-0200450719",
      nombreCuenta:        "BLANCA VERGARA",
      relevanciaComercial: "ALTO",
      razonSocial:         null,
      estadoOverride:      null,
      activo:              true,
    },
  });

  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: PROVEEDOR_ID } });
  for (const c of cuotasData) {
    await prisma.proveedorCuota.create({
      data: {
        proveedorId: PROVEEDOR_ID,
        numero:      c.numero,
        monto:       c.monto,
        igv:         c.igv,
        fechaCobro:  c.fechaCobro,
        estado:      c.estado,
        detalle:     c.detalle,
        fecha:       c.fecha,
      },
    });
  }
  console.log("  ✓ PRV-006 actualizado con 12 cuotas");

  // ── 3. Verificar estado final ────────────────────────────────────────────
  const todos = await prisma.proveedor.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, ubicacion: true, ciudad: true },
    orderBy: { id: "asc" },
  });
  console.log(`\nResumen final (${todos.length} proveedores activos):`);
  todos.forEach((r) => {
    const code = `PRV-${String(r.id).padStart(3, "0")}`;
    console.log(`  ${code}  ${r.nombre}  |  ${r.ubicacion}  [${r.ciudad ?? "—"}]`);
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
