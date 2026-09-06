/**
 * Crea (una sola vez, idempotente) el "usuario sistema" que representa al puente
 * Proyecto → Almacén: las peticiones autenticadas con la clave de servicio
 * (ALMACEN_BRIDGE_API_KEY, ver src/middlewares/servicioOAuth.middleware.js) quedan
 * registradas en MovimientoAlmacen bajo este usuario.
 *
 * Password aleatorio + activo:false: nunca puede loguearse por el flujo normal.
 *
 * Ejecutar: node scripts/setup-usuario-sistema.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

const EMAIL = "sistema.proyectos@almacen.interno";

async function main() {
  const existente = await prisma.usuario.findUnique({ where: { email: EMAIL } });
  if (existente) {
    console.log(`Ya existe (id ${existente.id}), nada que hacer.`);
    return;
  }

  const passwordAleatorio = await bcrypt.hash(crypto.randomUUID(), 10);
  const usuario = await prisma.usuario.create({
    data: {
      nombre: "Sistema — Proyectos (seguimiento-actividades)",
      email: EMAIL,
      password: passwordAleatorio,
      role: "ADMIN",
      activo: false,
    },
  });
  console.log(`✅ Usuario sistema creado (id ${usuario.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
