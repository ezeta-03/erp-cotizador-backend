// backend/prisma/seed-parte1.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.configuracion.findFirst();

  function calcularPrecios(costoMaterial) {
    const costoParcial1 = costoMaterial * (1 + config.costo_indirecto);
    const costoParcial2 = costoParcial1 * (1 + config.porcentaje_administrativo);
    const precioFinal = costoParcial2 * (1 + config.rentabilidad);
    const margen = precioFinal * config.rentabilidad;
    return { costo_parcial_1: costoParcial1, costo_parcial_2: costoParcial2, precio_final: precioFinal, margen };
  }

  const productos = [
    { categoria: "IMPRESIONES", servicio: "Vinil", material: "vinil básico m²", unidad: "m2", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Vinil", material: "vinil colores", unidad: "m2", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Vinil", material: "vinil blackout m²", unidad: "m2", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Banner", material: "banner delgado m²", unidad: "m2", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Banner", material: "banner grueso m²", unidad: "m2", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Banner", material: "banner blackout m²", unidad: "m2", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Laminado", material: "laminado m²", unidad: "m2", costo_material: 30 },
  ];

  for (const p of productos) {
    await prisma.producto.create({ data: { ...p, ...calcularPrecios(p.costo_material) } });
  }

  await prisma.producto.create({
    data: {
      categoria: "IMPRESIONES",
      servicio: "Roll Screens",
      material: "Roll Screens",
      unidad: "unid",
      costo_material: 30,
      ...calcularPrecios(30),
      adicionales: {
        create: [
          { nombre: "Base simple", precio: 10 },
          { nombre: "Banner", precio: 10 },
          { nombre: "Instalación", precio: 10 },
        ],
      },
    },
  });
}

main()
  .then(() => console.log("✅ Parte 1 ejecutada"))
  .catch((e) => console.error("❌ Error:", e))
  .finally(async () => await prisma.$disconnect());
