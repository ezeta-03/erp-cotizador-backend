// backend/prisma/seed-parte2.js
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

  const materiales = [
    { categoria: "IMPRESIONES", servicio: "Backing", material: "Estructura de backing", unidad: "estructura", costo_material: 30 },
    { categoria: "MATERIALES", servicio: "PVC", material: "Pvc 5mm - 124x244m", unidad: "plancha", costo_material: 30 },
    { categoria: "MATERIALES", servicio: "PVC", material: "Pvc 3mm - 124x244m", unidad: "plancha", costo_material: 30 },
    { categoria: "MATERIALES", servicio: "Acrílico", material: "Acrílico transparente de 2mm 122x183", unidad: "plancha", costo_material: 30 },
    { categoria: "MATERIALES", servicio: "Acrílico", material: "Acrílico colores de 2mm 122x183", unidad: "plancha", costo_material: 30 },
  ];

  for (const p of materiales) {
    await prisma.producto.create({ data: { ...p, ...calcularPrecios(p.costo_material) } });
  }

  await prisma.producto.create({
    data: {
      categoria: "IMPRESIONES",
      servicio: "Backing",
      material: "Estructura de backing + banner blackout",
      unidad: "estructura",
      costo_material: 30,
      ...calcularPrecios(30),
      adicionales: {
        create: [{ nombre: "Banner blackout", precio: 15 }],
      },
    },
  });

  await prisma.producto.create({
    data: {
      categoria: "IMPRESIONES",
      servicio: "Carpetas",
      material: "Carpeta oficio",
      unidad: "ciento",
      costo_material: 30,
      ...calcularPrecios(30),
      adicionales: {
        create: [
          { nombre: "Couche plastificado mate", precio: 5 },
          { nombre: "Couche plastificado brillo", precio: 5 },
          { nombre: "Folcote plastificado C12brillo tira", precio: 5 },
          { nombre: "Folcote plastificado C14brillo tira", precio: 5 },
        ],
      },
    },
  });
}

main()
  .then(() => console.log("✅ Parte 2 ejecutada"))
  .catch((e) => console.error("❌ Error:", e))
  .finally(async () => await prisma.$disconnect());
