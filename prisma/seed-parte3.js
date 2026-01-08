// backend/prisma/seed-parte3.js
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
    { categoria: "IMPRESIONES", servicio: "Tarjetas", material: "tarjetas mate 300gr", unidad: "millar", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Tarjetas", material: "tarjetas brillo 350gr", unidad: "millar", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Volantes", material: "volante 90gr - A6 1/4 de oficio", unidad: "millar", costo_material: 30 },
    { categoria: "IMPRESIONES", servicio: "Afiches", material: "afiches 115gr - A3", unidad: "millar", costo_material: 30 },
    { categoria: "BTL", servicio: "Biciballa", material: "Banner", unidad: "unidad", costo_material: 30 },
    { categoria: "BTL", servicio: "Motovalla", material: "Alquiler de moto x hora", unidad: "unidad", costo_material: 30 },
    { categoria: "BTL", servicio: "Taxi", material: "Alquiler de taxi", unidad: "unidad", costo_material: 30 },
    { categoria: "BTL", servicio: "Camión", material: "Alquiler de camión x hora", unidad: "unidad", costo_material: 30 },
  ];

  for (const p of productos) {
    await prisma.producto.create({ data: { ...p, ...calcularPrecios(p.costo_material) } });
  }
}

main()
  .then(() => console.log("✅ Parte 3 ejecutada"))
  .catch((e) => console.error("❌ Error:", e))
  .finally(async () => await prisma.$disconnect());
