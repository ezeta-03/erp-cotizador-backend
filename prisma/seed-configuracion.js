// prisma/seed-configuracion.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedConfig() {
  const existing = await prisma.configuracion.findFirst();
  if (!existing) {
    await prisma.configuracion.create({
      data: {
        costo_indirecto: 0.10,
        porcentaje_administrativo: 0.17,
        rentabilidad: 0.20,
      },
    });
    console.log("✅ Configuración inicial creada");
  } else {
    console.log("ℹ️ Ya existe configuración, no se creó otra");
  }
  await prisma.$disconnect();
}

seedConfig();
