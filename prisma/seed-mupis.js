require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Datos tomados de la hoja "MUPIS - PALETAS" (historial Enero-Junio).
// precioMes/estado reflejan el último mes con dato disponible por fila.
const MUPIS = [
  { codigo: "MUPI-01", nombre: "Giraldez y FFCC",                          precioMes: 550,    estado: "OCUPADO" },
  { codigo: "MUPI-02", nombre: "Giraldez y Huancas",                       precioMes: 792,    estado: "OCUPADO" },
  { codigo: "MUPI-03", nombre: "FFCC y Centenario",                        precioMes: 562.5,  estado: "OCUPADO" },
  { codigo: "MUPI-04", nombre: "Huancas y Centenario",                     precioMes: null,   estado: "LIBRE"   },
  { codigo: "MUPI-05", nombre: "Solano y Centenario",                      precioMes: 700,    estado: "OCUPADO" },
  { codigo: "MUPI-06", nombre: "Solano y Abancay (Parque Tupac)",          precioMes: 562.5,  estado: "OCUPADO" },
  { codigo: "MUPI-07", nombre: "Uruguay y Leandra Torres (Parque Tupac)",  precioMes: 562.5,  estado: "OCUPADO" },
  { codigo: "MUPI-08", nombre: "San Carlos y Aurora",                      precioMes: 700,    estado: "LIBRE"   },
  { codigo: "MUPI-09", nombre: "FFCC Cdra 01 (Open Plaza)",                precioMes: 762.71, estado: "LIBRE"   },
  { codigo: "MUPI-10", nombre: "Prol. San Carlos Cdra 01 (Open Plaza)",    precioMes: 562.5,  estado: "OCUPADO" },
  { codigo: "MUPI-11", nombre: "Puno y Junin (Hospital El Carmen)",        precioMes: null,   estado: "LIBRE"   },
  { codigo: "MUPI-12", nombre: "Carrion y Tacna",                          precioMes: 800,    estado: "LIBRE"   },
];

async function main() {
  for (const m of MUPIS) {
    await prisma.panel.upsert({
      where: { codigo: m.codigo },
      update: {
        nombre: m.nombre,
        ubicacion: m.nombre,
        tipo: "MUPI",
        distrito: null,
        precioMes: m.precioMes,
        estado: m.estado,
        activo: true,
      },
      create: {
        codigo: m.codigo,
        nombre: m.nombre,
        ubicacion: m.nombre,
        tipo: "MUPI",
        distrito: null,
        precioMes: m.precioMes,
        estado: m.estado,
      },
    });
    console.log(`✔ ${m.codigo} — ${m.nombre}`);
  }
}

main()
  .then(() => console.log(`\n${MUPIS.length} mupis sincronizados.`))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
