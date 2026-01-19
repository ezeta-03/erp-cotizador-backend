// prisma/seed-admin.js
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

async function main() {
  const hash = await bcrypt.hash("123456", 10);

  await prisma.usuario.upsert({
    where: { email: "admin@erp.com" },
    update: {},
    create: {
      nombre: "Admin Root",
      email: "admin@erp.com",
      password: hash,
      role: "ADMIN",
      activo: true,
    },
  });
}

main().finally(() => prisma.$disconnect());
