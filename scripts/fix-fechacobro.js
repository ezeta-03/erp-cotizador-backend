/**
 * Asigna fechaCobro a todas las cuotas que tienen null,
 * usando la misma lógica que generarCuotas():
 *   cuota numero N → fechaCobro = inicio + (N-1) meses, mismo día
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const provs = await prisma.proveedor.findMany({
    where: { activo: true },
    include: { cuotas: { orderBy: { numero: "asc" } } },
    orderBy: { id: "asc" },
  });

  let total = 0;
  for (const p of provs) {
    const inicio = new Date(p.inicio);
    const dia    = inicio.getUTCDate();

    for (const c of p.cuotas) {
      if (c.fechaCobro !== null) continue; // ya tiene fecha, no tocar

      // cuota N → mes = mes inicio + (N - 1)
      const fecha = new Date(Date.UTC(
        inicio.getUTCFullYear(),
        inicio.getUTCMonth() + (c.numero - 1),
        dia,
      ));

      await prisma.proveedorCuota.update({
        where: { id: c.id },
        data:  { fechaCobro: fecha },
      });
      total++;
    }

    const code = `PRV-${String(p.id).padStart(3, "0")}`;
    const nullCount = p.cuotas.filter(c => c.fechaCobro === null).length;
    if (nullCount > 0) console.log(`  ✓ ${code}  ${nullCount} fechas asignadas`);
  }

  console.log(`\nTotal cuotas actualizadas: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
