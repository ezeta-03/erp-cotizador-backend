// backend/prisma/seed-productos-excel.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const config = await prisma.configuracion.findFirst();

// Función para calcular precios según lógica del Excel
function calcularPrecios(costoMaterial) {
  const costoParcial1 = costoMaterial * (1 + config.costo_indirecto);
  const costoParcial2 = costoParcial1 * (1 + config.porcentaje_administrativo);
  const precioFinal = costoParcial2 * (1 + config.rentabilidad);
  const margen = precioFinal * config.rentabilidad;

  return { costoParcial1, costoParcial2, precioFinal, margen };
}

const productosExcel = [
  // IMPRESIONES
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "vinil basico m²",
    unidad: "m2",
    costo_material: 25,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "vinil retroiluminado",
    unidad: "m2",
    costo_material: 35,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "vinil blackout m²",
    unidad: "m2",
    costo_material: 28,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "banner delgado m²",
    unidad: "m2",
    costo_material: 8,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "banner grueso m²",
    unidad: "m2",
    costo_material: 10,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "banner blackout m²",
    unidad: "m2",
    costo_material: 11,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "laminado m²",
    unidad: "m2",
    costo_material: 10,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Roll Screen+ base simple+ banner e instalación+ und",
    unidad: "und",
    costo_material: 65,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Roll Screen+ solo base",
    unidad: "und",
    costo_material: 45,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Estructura de backing",
    unidad: "und",
    costo_material: 270,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Estructura de backing + banner blackout",
    unidad: "und",
    costo_material: 350,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Rótulo",
    unidad: "und",
    costo_material: 280,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "blackout",
    unidad: "und",
    costo_material: 300,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Pvc 5mm - 1.24x2.44m",
    unidad: "plancha",
    costo_material: 50,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Pvc 3mm - 1.24-2.44m",
    unidad: "plancha",
    costo_material: 35,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Acrílico transparente de 2mm 1.22x1.83",
    unidad: "plancha",
    costo_material: 0,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "Acrílico colores de 2mm 1.22x1.83",
    unidad: "plancha",
    costo_material: 0,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "tarjeta mate 300gr",
    unidad: "millar",
    costo_material: 30,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "tarjeta brillo 350gr",
    unidad: "millar",
    costo_material: 33,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "tarjeta mate 350 gr",
    unidad: "millar",
    costo_material: 35,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "tarjeta acabado especial acetoriado",
    unidad: "millar",
    costo_material: 100,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "tarjetas acabado repujado",
    unidad: "millar",
    costo_material: 150,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "volante 90g - A5 1/4 de oficio",
    unidad: "millar",
    costo_material: 35,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "1olante 90g - A5 1/4 de oficio",
    unidad: "millar",
    costo_material: 65,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "volante 90g - 20x21",
    unidad: "millar",
    costo_material: 80,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "volante 150gr - A6 1/4 de oficio",
    unidad: "millar",
    costo_material: 43,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "volante 90g - A5 1/2 de oficio",
    unidad: "millar",
    costo_material: 76,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "volante 90gr - 20x21",
    unidad: "millar",
    costo_material: 110,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "volante 90gr - A4 oficio",
    unidad: "millar",
    costo_material: 142,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 90gr - A3",
    unidad: "millar",
    costo_material: 230,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiche 90gr - 35X50",
    unidad: "millar",
    costo_material: 350,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 90gr - 70X50",
    unidad: "millar",
    costo_material: 520,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 115gr - A3",
    unidad: "millar",
    costo_material: 270,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 115gr - 35X50",
    unidad: "millar",
    costo_material: 370,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 115gr - 70X50",
    unidad: "millar",
    costo_material: 550,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 150gr - A3",
    unidad: "millar",
    costo_material: 320,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 150gr - 35x50",
    unidad: "millar",
    costo_material: 400,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "afiches 150gr - 70x50",
    unidad: "millar",
    costo_material: 620,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "carpeta oficio couche plastificado mate",
    unidad: "ciento",
    costo_material: 1350,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "carpeta oficio couche plastificado brillo",
    unidad: "ciento",
    costo_material: 1350,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "carpeta oficio foldcote plastificado C12brillo ira ciento",
    unidad: "ciento",
    costo_material: 320,
  },
  {
    categoria: "IMPRESIONES",
    servicio: "IMPRESIONES",
    material: "carpeta oficio foldcote plastificado C12brillo ira ciento",
    unidad: "ciento",
    costo_material: 370,
  },

  // BTL - BICIVIALLA
  {
    categoria: "BTL",
    servicio: "BICIVIALLA",
    material: "1 Banner",
    unidad: "Unidad",
    costo_material: 10,
  },
  {
    categoria: "BTL",
    servicio: "BICIVIALLA",
    material: "Bobcalla alquiler",
    unidad: "Unidad",
    costo_material: 25,
  },
  {
    categoria: "BTL",
    servicio: "BICIVIALLA",
    material: "otros",
    unidad: null,
    costo_material: 1,
  },

  // BTL - MOTOVALLA
  {
    categoria: "BTL",
    servicio: "MOTOVALLA",
    material: "1 banner",
    unidad: "Unidad",
    costo_material: 10,
  },
  {
    categoria: "BTL",
    servicio: "MOTOVALLA",
    material: "Alquiler de moto x hora",
    unidad: "Unidad",
    costo_material: 30,
  },
  {
    categoria: "BTL",
    servicio: "MOTOVALLA",
    material: "Otros",
    unidad: null,
    costo_material: 1,
  },

  // BTL - MOCHILAS VALLA
  {
    categoria: "BTL",
    servicio: "MOCHILAS VALLA",
    material: "1 Vinil",
    unidad: "Unidad",
    costo_material: 25,
  },
  {
    categoria: "BTL",
    servicio: "MOCHILAS VALLA",
    material: "mochilas x hora",
    unidad: "Unidad",
    costo_material: 20,
  },
  {
    categoria: "BTL",
    servicio: "MOCHILAS VALLA",
    material: "otros",
    unidad: null,
    costo_material: 1,
  },

  // BTL - PUBLICIDAD EN TAXI
  {
    categoria: "BTL",
    servicio: "PUBLICIDAD EN TAXI",
    material: "1 Banner",
    unidad: "Unidad",
    costo_material: 10,
  },
  {
    categoria: "BTL",
    servicio: "PUBLICIDAD EN TAXI",
    material: "alquiler de taxi",
    unidad: "Unidad",
    costo_material: 2,
  },
  {
    categoria: "BTL",
    servicio: "PUBLICIDAD EN TAXI",
    material: "ganchos o soporte x taxi",
    unidad: "Unidad",
    costo_material: 15,
  },

  // BTL - CAMIONES PUBLICITARIOS
  {
    categoria: "BTL",
    servicio: "CAMIONES PUBLICITARIOS",
    material: "1 Banner",
    unidad: "Unidad",
    costo_material: 10,
  },
  {
    categoria: "BTL",
    servicio: "CAMIONES PUBLICITARIOS",
    material: "alquiler de camion x hora",
    unidad: null,
    costo_material: 45,
  },
  {
    categoria: "BTL",
    servicio: "CAMIONES PUBLICITARIOS",
    material: "otros",
    unidad: null,
    costo_material: 1,
  },
];

async function seed() {
  try {
    console.log("🌱 Iniciando seed de productos desde Excel...\n");

    // Limpiar productos existentes
    const deleteCount = await prisma.producto.deleteMany({});
    console.log(`🗑️  ${deleteCount.count} productos anteriores eliminados\n`);

    let creados = 0;

    for (const prod of productosExcel) {
      const precios = calcularPrecios(prod.costo_material);

      await prisma.producto.create({
        data: {
          // Columnas del Excel
          categoria: prod.categoria,
          servicio: prod.servicio,
          material: prod.material,
          unidad: prod.unidad,
          costo_material: prod.costo_material,
          costo_parcial_1: precios.costo_parcial_1,
          costo_parcial_2: precios.costo_parcial_2,
          precio_final: precios.precio_final,
          margen: precios.margen,

          // Compatibilidad
          nombre: prod.servicio,
          activo: true,
        },
      });

      creados++;
    }

    console.log(`✅ ${creados} productos creados exitosamente\n`);

    // Resumen por categoría
    const categorias = await prisma.producto.groupBy({
      by: ["categoria"],
      _count: true,
    });

    console.log("📊 Resumen por categoría:");
    categorias.forEach((cat) => {
      console.log(`   ${cat.categoria}: ${cat._count} productos`);
    });

    // Mostrar algunos ejemplos con cálculos
    console.log("\n💰 Ejemplo de cálculos (primeros 3 productos):");
    const ejemplos = await prisma.producto.findMany({ take: 3 });
    ejemplos.forEach((p) => {
      console.log(`\n   ${p.servicio} - ${p.material}`);
      console.log(`   Costo Material:  S/ ${p.costo_material.toFixed(2)}`);
      console.log(
        `   Costo Parcial 1: S/ ${p.costo_parcial_1.toFixed(2)} (+10%)`
      );
      console.log(
        `   Costo Parcial 2: S/ ${p.costo_parcial_2.toFixed(2)} (+17%)`
      );
      console.log(`   Precio Final:    S/ ${p.precio_final.toFixed(2)} (+20%)`);
      console.log(`   Margen:          S/ ${p.margen.toFixed(2)}`);
    });

    console.log("\n🎉 Seed completado!\n");
  } catch (error) {
    console.error("❌ Error en seed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
