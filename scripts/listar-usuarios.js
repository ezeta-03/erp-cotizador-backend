require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, email: true, role: true, activo: true },
  });
  console.log("\n📋 USUARIOS EN LA BASE DE DATOS:\n");
  console.table(usuarios);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
