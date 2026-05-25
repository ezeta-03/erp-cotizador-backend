require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MESES = [
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE",
];

function generarCuotas(inicio, fin, costoMensual) {
  const cuotas = [];
  const start = new Date(inicio);
  const end   = new Date(fin);
  const igvRate = 0.18;

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  let numero  = 1;

  while (current < new Date(end.getFullYear(), end.getMonth(), 1)) {
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
}

const COMUN = {
  inicio:              new Date("2026-03-12"),
  fin:                 new Date("2027-03-11"),
  costoLuzMes:         150,
  elementos:           "Torre 10m x 5m",
  tipoContrato:        "Alquiler Estructura",
  relevanciaComercial: "ALTO",
  nombreCuenta:        "Blanca Vergara",
  numeroCuenta:        "0011-0237-0200450719",
  nombre:              "Blanca Vergara",
};

const FICHAS = [
  { ciudad: "Arequipa", ubicacion: "Mall Aventura - Arequipa",       costoMensual: 1200 },
  { ciudad: "Arequipa", ubicacion: "Cayma - Arequipa",               costoMensual: 3000 },
  { ciudad: "Ica",      ubicacion: "Subjantalla - Ica",              costoMensual: 1800 },
  { ciudad: "Huancayo", ubicacion: "Av. Mariátegui A - Huancayo",    costoMensual: 1700 },
  { ciudad: "Huancayo", ubicacion: "Av. Mariátegui B - Huancayo",    costoMensual: 1800 },
  { ciudad: "Huancayo", ubicacion: "Av. Tumbes - Huancayo",          costoMensual: 2300 },
  { ciudad: "Huancayo", ubicacion: "Secada - Huancayo",              costoMensual: 2500 },
  { ciudad: "Huancayo", ubicacion: "Av. Marina - Huancayo",          costoMensual: 1000 },
  { ciudad: "Huancayo", ubicacion: "Av. Mesones Muro - Huancayo",    costoMensual: 2500 },
  { ciudad: "Huancayo", ubicacion: "Iquitos-Nauta - Huancayo",       costoMensual: 1000 },
];

async function patchCuotasEspeciales(proveedorId) {
  const cuotas = await prisma.proveedorCuota.findMany({
    where: { proveedorId },
    orderBy: { numero: "asc" },
  });
  if (cuotas.length === 0) return;

  const primera = cuotas[0];
  const ultima  = cuotas[cuotas.length - 1];

  await prisma.proveedorCuota.update({
    where: { id: primera.id },
    data: { estado: "CANCELADO", fecha: "09/03/2026" },
  });

  await prisma.proveedorCuota.update({
    where: { id: ultima.id },
    data: { detalle: "PAGO LUZ" },
  });
}

async function main() {
  console.log("Iniciando seed de proveedores…");

  /* ── 1. Actualizar PRV-001 (id=1) con la primera ficha ── */
  const ficha0 = FICHAS[0];
  const cuotas0 = generarCuotas(COMUN.inicio, COMUN.fin, ficha0.costoMensual);

  await prisma.proveedorCuota.deleteMany({ where: { proveedorId: 1 } });
  await prisma.proveedor.update({
    where: { id: 1 },
    data: {
      ...COMUN,
      ciudad:       ficha0.ciudad,
      ubicacion:    ficha0.ubicacion,
      costoMensual: ficha0.costoMensual,
      activo:       true,
      cuotas: { create: cuotas0 },
    },
  });
  await patchCuotasEspeciales(1);
  console.log(`  PRV-001 actualizado → ${ficha0.ubicacion}`);

  /* ── 2. Crear las 9 fichas restantes ── */
  for (let i = 1; i < FICHAS.length; i++) {
    const ficha  = FICHAS[i];
    const cuotas = generarCuotas(COMUN.inicio, COMUN.fin, ficha.costoMensual);

    const prov = await prisma.proveedor.create({
      data: {
        ...COMUN,
        ciudad:       ficha.ciudad,
        ubicacion:    ficha.ubicacion,
        costoMensual: ficha.costoMensual,
        cuotas: { create: cuotas },
      },
    });

    await patchCuotasEspeciales(prov.id);
    console.log(`  PRV-${String(prov.id).padStart(3,"0")} creado → ${ficha.ubicacion}`);
  }

  console.log("Seed completado.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
