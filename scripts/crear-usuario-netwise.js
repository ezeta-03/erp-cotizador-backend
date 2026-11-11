// Crea (o actualiza) el usuario Netwise: rol CONTABLE con la interfaz de marca
// NETWISE. Mismos datos y funciones que Contabilidad; solo cambia la apariencia.
//
// Uso:
//   node scripts/crear-usuario-netwise.js <email> <contraseña> ["Nombre"]
// Usa la DATABASE_URL del entorno: revisa a qué base apunta antes de correrlo.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

async function main() {
  const [email, password, nombre = "Netwise"] = process.argv.slice(2);
  if (!email || !password || password.length < 6) {
    console.error("Uso: node scripts/crear-usuario-netwise.js <email> <contraseña (mín. 6)> [\"Nombre\"]");
    process.exit(1);
  }

  const data = {
    nombre,
    role: "CONTABLE",
    marca: "NETWISE",
    activo: true,
    password: await bcrypt.hash(password, 10),
    activationToken: null,
    activationExpires: null,
  };

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: data,
    create: { email, ...data },
    select: { id: true, nombre: true, email: true, role: true, marca: true },
  });
  console.log("✅ Usuario Netwise listo:", usuario);
}

main()
  .catch((e) => { console.error("❌", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
