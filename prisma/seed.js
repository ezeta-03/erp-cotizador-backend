const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de usuarios...");

  const passwordAdmin = await bcrypt.hash("admin123", 10);
  const passwordVentas = await bcrypt.hash("ventas123", 10);
  const passwordCliente = await bcrypt.hash("cliente123", 10);

  await prisma.user.createMany({
    data: [
      {
        nombre: "Administrador",
        email: "admin@demo.com",
        password: passwordAdmin,
        role: "ADMIN"
      },
      {
        nombre: "Vendedor",
        email: "ventas@demo.com",
        password: passwordVentas,
        role: "VENTAS"
      },
      {
        nombre: "Cliente Demo",
        email: "cliente@demo.com",
        password: passwordCliente,
        role: "CLIENTE"
      }
    ],
    skipDuplicates: true
  });

  console.log("✅ Usuarios creados correctamente");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
