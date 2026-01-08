// backend/src/controllers/productos.controller.js
const prisma = require("../config/prisma");
const XLSX = require("xlsx");

// Función helper para calcular precios
function calcularPrecios(costoMaterial) {
  const costoParcial1 = costoMaterial * 1.10; // +10%
  const costoParcial2 = costoParcial1 * 1.17; // +17%
  const precioFinal = costoParcial2 * 1.20;   // +20%
  const margen = precioFinal * 0.20;          // 20% del precio final
  
  return {
    costo_parcial_1: parseFloat(costoParcial1.toFixed(2)),
    costo_parcial_2: parseFloat(costoParcial2.toFixed(2)),
    precio_final: parseFloat(precioFinal.toFixed(2)),
    margen: parseFloat(margen.toFixed(2))
  };
}

// Crear producto
exports.crear = async (req, res) => {
  try {
    const { categoria, servicio, capacidad_productiva, unidad, valor_unitario, costo_material } = req.body;
    
    const precios = calcularPrecios(Number(costo_material));
    
    const producto = await prisma.producto.create({
      data: {
        categoria,
        servicio,
        capacidad_productiva,
        unidad,
        valor_unitario: valor_unitario ? Number(valor_unitario) : null,
        costo_material: Number(costo_material),
        ...precios,
        // Compatibilidad
        nombre: servicio,
        precio_material: Number(costo_material),
        precio_mano_obra: 0,
        activo: true
      }
    });

    res.json(producto);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ message: "Error al crear producto", error: error.message });
  }
};

// Listar productos
exports.listar = async (req, res) => {
  try {
    const { activo, categoria } = req.query;
    
    const where = {};
    if (activo !== undefined) where.activo = activo === 'true';
    if (categoria) where.categoria = categoria;
    
    const productos = await prisma.producto.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        adicionales: true, // 👈 ahora sí trae los adicionales
      },
    });
    
    res.json(productos);
  } catch (error) {
    console.error('Error al listar productos:', error);
    res.status(500).json({ message: "Error al listar productos" });
  }
};



// Actualizar producto
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // Recalcular precios si cambió el costo_material
    let preciosActualizados = {};
    if (data.costo_material !== undefined) {
      preciosActualizados = calcularPrecios(Number(data.costo_material));
    }

    const dataToUpdate = { ...data };
    
    // Aplicar precios calculados
    if (Object.keys(preciosActualizados).length > 0) {
      Object.assign(dataToUpdate, preciosActualizados);
    }
    
    // Actualizar compatibilidad
    if (data.servicio) dataToUpdate.nombre = data.servicio;
    if (data.costo_material) dataToUpdate.precio_material = Number(data.costo_material);
    
    // Convertir números
    if (dataToUpdate.costo_material) dataToUpdate.costo_material = Number(dataToUpdate.costo_material);
    if (dataToUpdate.valor_unitario) dataToUpdate.valor_unitario = Number(dataToUpdate.valor_unitario);

    const producto = await prisma.producto.update({
      where: { id: Number(id) },
      data: dataToUpdate
    });

    res.json(producto);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ message: "Error al actualizar producto", error: error.message });
  }
};

// Eliminar producto (soft delete)
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.producto.update({
      where: { id: Number(id) },
      data: { activo: false }
    });

    res.json({ message: "Producto desactivado" });
  } catch (error) {
    res.status(500).json({ message: "Error al eliminar producto" });
  }
};

// Importar productos desde Excel
exports.importarExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se envió ningún archivo" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ message: "El archivo está vacío" });
    }

    const resultados = {
      creados: 0,
      actualizados: 0,
      errores: [],
      total: data.length
    };

    for (let i = 0; i < data.length; i++) {
      const fila = data[i];
      
      try {
        const categoria = fila['Categoria'] || fila['Categoría'] || fila['CATEGORIA'];
        const servicio = fila['Servicio'] || fila['SERVICIO'];
        const capacidad_productiva = fila['Capacidad Productiva'] || fila['CAPACIDAD PRODUCTIVA'] || null;
        const unidad = fila['Unidad'] || fila['UNIDAD'] || null;
        const valor_unitario = fila['Valor Unitario'] || fila['VALOR UNITARIO'] || null;
        const costo_material = Number(fila['Costo Material'] || fila['COSTO MATERIAL'] || fila['Material'] || 0);

        if (!categoria || !servicio) {
          resultados.errores.push({ fila: i + 2, error: 'Faltan campos requeridos (Categoria, Servicio)' });
          continue;
        }

        const precios = calcularPrecios(costo_material);

        // Buscar si existe producto similar
        const existente = await prisma.producto.findFirst({
          where: {
            categoria,
            servicio,
            capacidad_productiva
          }
        });

        if (existente) {
          await prisma.producto.update({
            where: { id: existente.id },
            data: {
              costo_material,
              unidad,
              valor_unitario,
              ...precios,
              nombre: servicio,
              precio_material: costo_material,
              activo: true
            }
          });
          resultados.actualizados++;
        } else {
          await prisma.producto.create({
            data: {
              categoria,
              servicio,
              capacidad_productiva,
              unidad,
              valor_unitario,
              costo_material,
              ...precios,
              nombre: servicio,
              precio_material: costo_material,
              precio_mano_obra: 0,
              activo: true
            }
          });
          resultados.creados++;
        }
      } catch (error) {
        resultados.errores.push({ fila: i + 2, error: error.message });
      }
    }

    res.json({
      message: "Importación completada",
      ...resultados
    });

  } catch (error) {
    console.error('Error al importar Excel:', error);
    res.status(500).json({ message: "Error al importar archivo", error: error.message });
  }
};

// Exportar productos a Excel
exports.exportarExcel = async (req, res) => {
  try {
    const { tipo } = req.query;

    let data = [];

    if (tipo === 'plantilla') {
      data = [{
        'Categoria': 'IMPRESIONES',
        'Servicio': 'Ejemplo Servicio',
        'Capacidad Productiva': '1 unidad de ejemplo',
        'Unidad': 'und',
        'Valor Unitario': 0,
        'Costo Material': 100
      }];
    } else {
      const productos = await prisma.producto.findMany({
        where: { activo: true },
        orderBy: { id: 'asc' }
      });

      data = productos.map(p => ({
        'Categoria': p.categoria,
        'Servicio': p.servicio,
        'Capacidad Productiva': p.capacidad_productiva || '',
        'Unidad': p.unidad || '',
        'Valor Unitario': p.valor_unitario || 0,
        'Costo Material': p.costo_material,
        'Costo Parcial 1': p.costo_parcial_1,
        'Costo Parcial 2': p.costo_parcial_2,
        'Precio Final': p.precio_final,
        'Margen': p.margen
      }));
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=productos_${tipo === 'plantilla' ? 'plantilla' : Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('Error al exportar Excel:', error);
    res.status(500).json({ message: "Error al exportar archivo" });
  }
};