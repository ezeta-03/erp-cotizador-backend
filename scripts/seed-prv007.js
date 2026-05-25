const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ID = 7;
const cuotas = [
  { numero: 1,  monto: 2300, igv: 414, fechaCobro: new Date("2026-03-09"), estado: "CANCELADO", detalle: "TRANSFERENCIA",   fecha: "PRIMERA SEMANA MARZO 2026" },
  { numero: 2,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: "PAGO EN EFECTIVO", fecha: "PRIMERA SEMANA ABRIL" },
  { numero: 3,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA MAYO" },
  { numero: 4,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA JUNIO" },
  { numero: 5,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA JULIO" },
  { numero: 6,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA AGOSTO" },
  { numero: 7,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA SETIEMBRE" },
  { numero: 8,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA OCTUBRE" },
  { numero: 9,  monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA NOVIEMBRE" },
  { numero: 10, monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA DICIEMBRE" },
  { numero: 11, monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: null, fecha: "PRIMERA SEMANA ENERO" },
  { numero: 12, monto: 2300, igv: 414, fechaCobro: null, estado: "PENDIENTE", detalle: "PAGO LUZ", fecha: "PRIMERA SEMANA FEBRERO" },
];

async function main() {
  await prisma.proveedor.update({
    where: { id: ID },
    data: {
      nombre: "BLANCA VERGARA", ciudad: "HUANCAYO", ubicacion: "AV. TUMBES CON LIBERTAD",
      tipoContrato: "ALQUILER ESTRUCTURA", elementos: "TORRE 10m X 5m",
      inicio: new Date("2026-03-12"), fin: new Date("2027-03-11"),
      costoMensual: 2300, costoLuzMes: 150,
      numeroCuenta: "0011-0237-0200450719", nombreCuenta: "BLANCA VERGARA",
      relevanciaComercial: "ALTO", razonSocial: null, estadoOverride: null, activo: true,
    },
  });
  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: ID } });
  for (const c of cuotas) {
    await prisma.proveedorCuota.create({ data: { proveedorId: ID, ...c } });
  }
  const total = cuotas.reduce((s, c) => s + c.monto + c.igv, 0);
  console.log(`PRV-00${ID}: AV. TUMBES CON LIBERTAD | 12 cuotas | Total: S/ ${total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
