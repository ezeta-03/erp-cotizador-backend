const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("123456", 10);

  /* =========================
     ADMINS (2)
  ========================= */
  await prisma.usuario.createMany({
    data: [
      {
        nombre: "Admin Principal",
        email: "admin1@demo.com",
        password,
        role: "ADMIN",
      },
      {
        nombre: "Admin Secundario",
        email: "admin2@demo.com",
        password,
        role: "ADMIN",
      },
    ],
  });

  /* =========================
     VENDEDORES (3)
  ========================= */
  await prisma.usuario.createMany({
    data: [
      {
        nombre: "Juan Ventas",
        email: "ventas1@demo.com",
        password,
        role: "VENTAS",
      },
      {
        nombre: "Ana Ventas",
        email: "ventas2@demo.com",
        password,
        role: "VENTAS",
      },
      {
        nombre: "Pedro Ventas",
        email: "ventas3@demo.com",
        password,
        role: "VENTAS",
      },
    ],
  });

  /* =========================
     CLIENTES (4) con USUARIO
  ========================= */
  await prisma.usuario.create({
    data: {
      nombre: "Carlos Cliente",
      email: "cliente1@demo.com",
      password,
      role: "CLIENTE",
      cliente: {
        create: {
          nombre: "Carlos Cliente SAC",
          email: "cliente1@demo.com",
          telefono: "999111111",
        },
      },
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Maria Cliente",
      email: "cliente2@demo.com",
      password,
      role: "CLIENTE",
      cliente: {
        create: {
          nombre: "Maria Cliente EIRL",
          email: "cliente2@demo.com",
          telefono: "999222222",
        },
      },
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Luis Cliente",
      email: "cliente3@demo.com",
      password,
      role: "CLIENTE",
      cliente: {
        create: {
          nombre: "Luis Cliente SAC",
          email: "cliente3@demo.com",
          telefono: "999333333",
        },
      },
    },
  });

  await prisma.usuario.create({
    data: {
      nombre: "Sofia Cliente",
      email: "cliente4@demo.com",
      password,
      role: "CLIENTE",
      cliente: {
        create: {
          nombre: "Sofia Cliente SAC",
          email: "cliente4@demo.com",
          telefono: "999444444",
        },
      },
    },
  });

  console.log("✅ Seed ejecutado correctamente");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
