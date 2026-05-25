const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.proveedor.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, ciudad: true, fin: true },
    orderBy: { id: "asc" },
  });
  console.log(`Total activos: ${rows.length}\n`);
  rows.forEach((r) => {
    const code = `PRV-${String(r.id).padStart(3, "0")}`;
    console.log(`${code}  ${r.nombre}  [${r.ciudad ?? "—"}]  fin: ${String(r.fin).slice(0, 10)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
