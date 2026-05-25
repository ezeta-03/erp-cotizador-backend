const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const inactivos = await prisma.proveedor.findMany({
    where: { activo: false },
    select: { id: true, nombre: true, ciudad: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  console.log(`Proveedores eliminados (activo=false): ${inactivos.length}`);
  inactivos.forEach((r) => {
    console.log(`  PRV-${String(r.id).padStart(3, "0")}  ${r.nombre}  [${r.ciudad ?? "—"}]  eliminado: ${r.updatedAt.toISOString().slice(0, 10)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
