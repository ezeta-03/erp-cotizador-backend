// Número con el que se muestra un documento por pagar: el correlativo interno
// en las notas de venta (NV-000123) y serie-número en el resto.
const numeroPropio = (c) => `${c.serie}-${c.numero}`;
const etiquetaDocumento = (c) => c.numeroInterno || numeroPropio(c);
// Número que trae el proveedor en una nota de venta, si es distinto del interno.
const referenciaProveedor = (c) => (c.numeroInterno && numeroPropio(c) !== c.numeroInterno ? numeroPropio(c) : null);

module.exports = { etiquetaDocumento, referenciaProveedor };
