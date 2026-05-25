/**
 * Verifica y corrige estadoOverride:
 * - Si no todas las cuotas son CANCELADO pero estadoOverride = "CANCELADO" → pone null
 * - Si todas son CANCELADO → mantiene "CANCELADO"
 * - SUSPENDIDO siempre se respeta
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const provs = await prisma.proveedor.findMany({
    where: { activo: true },
    include: { cuotas: true },
    orderBy: { id: "asc" },
  });

  console.log("Estado actual:\n");
  for (const p of provs) {
    const code        = `PRV-${String(p.id).padStart(3, "0")}`;
    const total       = p.cuotas.length;
    const canceladas  = p.cuotas.filter((c) => c.estado === "CANCELADO").length;
    const todasCancel = total > 0 && canceladas === total;
    const override    = p.estadoOverride;

    const necesitaFix = override === "CANCELADO" && !todasCancel;

    console.log(
      `${code}  cuotas: ${canceladas}/${total} canceladas` +
      `  override: ${override ?? "null"}` +
      (necesitaFix ? "  ← FIX NEEDED" : "")
    );

    if (necesitaFix) {
      await prisma.proveedor.update({
        where: { id: p.id },
        data: { estadoOverride: null },
      });
      console.log(`       ✓ estadoOverride corregido a null`);
    }
  }

  console.log("\nHecho.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
