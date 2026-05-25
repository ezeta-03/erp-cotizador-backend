require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Backfill fechaCobro…");

  const proveedores = await prisma.proveedor.findMany({
    include: { cuotas: { orderBy: { numero: "asc" } } },
  });

  let total = 0;
  for (const p of proveedores) {
    const diaInicio = new Date(p.inicio).getUTCDate();

    for (const c of p.cuotas) {
      if (c.fechaCobro) continue; // ya tiene valor, saltar

      // La cuota número N corresponde al mes (inicio + N-1 meses)
      const d = new Date(p.inicio);
      const mesBase = d.getUTCMonth() + (c.numero - 1);
      const anio    = d.getUTCFullYear() + Math.floor(mesBase / 12);
      const mes     = mesBase % 12;

      await prisma.proveedorCuota.update({
        where: { id: c.id },
        data:  { fechaCobro: new Date(anio, mes, diaInicio) },
      });
      total++;
    }
  }

  console.log(`  ${total} cuotas actualizadas.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
