const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("123456", 10);

  // 🔹 ADMIN
  await prisma.usuario.create({
    data: {
      nombre: "Admin Principal",
      email: "admin@demo.com",
      password,
      role: "ADMIN",
    },
  });

  // 🔹 VENDEDORES
  await prisma.usuario.create({
    data: {
      nombre: "Juan Ventas",
      email: "ventas1@demo.com",
      password,
      role: "VENTAS",
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Ana Ventas",
      email: "ventas2@demo.com",
      password,
      role: "VENTAS",
    },
  });

  // 🔹 CLIENTE + USUARIO
  await prisma.usuario.create({
    data: {
      nombre: "Carlos Cliente",
      email: "cliente@demo.com",
      password,
      role: "CLIENTE",
      cliente: {
        create: {
          nombre: "Carlos Cliente",
          correo: "cliente@demo.com",
          telefono: "999888777",
        },
      },
    },
  });

  console.log("✅ Seed ejecutado correctamente");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
