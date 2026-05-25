const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PROVEEDOR_ID = 5;

const cuotasData = [
  { numero: 1,  monto: 1700, igv: 306, fechaCobro: new Date("2026-03-09"), estado: "CANCELADO", detalle: "TRANSFERENCIA",   fecha: "PRIMERA SEMANA MARZO 2026" },
  { numero: 2,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: "PAGO EN EFECTIVO", fecha: "PRIMERA SEMANA ABRIL" },
  { numero: 3,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA MAYO" },
  { numero: 4,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA JUNIO" },
  { numero: 5,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA JULIO" },
  { numero: 6,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA AGOSTO" },
  { numero: 7,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA SETIEMBRE" },
  { numero: 8,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA OCTUBRE" },
  { numero: 9,  monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA NOVIEMBRE" },
  { numero: 10, monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA DICIEMBRE" },
  { numero: 11, monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA ENERO" },
  { numero: 12, monto: 1700, igv: 306, fechaCobro: null, estado: "PENDIENTE", detalle: "PAGO LUZ", fecha: "PRIMERA SEMANA FEBRERO" },
];

async function main() {
  console.log(`Actualizando PRV-00${PROVEEDOR_ID}...`);

  await prisma.proveedor.update({
    where: { id: PROVEEDOR_ID },
    data: {
      nombre:              "BLANCA VERGARA",
      ciudad:              "HUANCAYO",
      ubicacion:           "AV. MARIATEGUI Y REAL",
      tipoContrato:        "ALQUILER ESTRUCTURA",
      elementos:           "TORRE 10m X 5m",
      inicio:              new Date("2026-03-12"),
      fin:                 new Date("2027-03-11"),
      costoMensual:        1700,
      costoLuzMes:         150,
      numeroCuenta:        "0011-0237-0200450719",
      nombreCuenta:        "BLANCA VERGARA",
      relevanciaComercial: "ALTO",
      razonSocial:         null,
      estadoOverride:      null,
      activo:              true,
    },
  });
  console.log("  ✓ Proveedor actualizado");

  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: PROVEEDOR_ID } });
  console.log("  ✓ Cuotas anteriores eliminadas");

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
  console.log("  ✓ 12 cuotas creadas");

  const prov = await prisma.proveedor.findUnique({
    where: { id: PROVEEDOR_ID },
    include: { cuotas: { orderBy: { numero: "asc" } } },
  });
  const total = prov.cuotas.reduce((s, c) => s + c.monto + c.igv, 0);
  console.log(`\n  PRV-00${PROVEEDOR_ID}: ${prov.nombre} | ${prov.ubicacion} | ${prov.cuotas.length} cuotas | Total: S/ ${total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`);
  console.log("  Cuota 1 estado:", prov.cuotas[0].estado);
  console.log("\nListo.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
