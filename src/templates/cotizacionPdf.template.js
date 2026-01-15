module.exports = (cotizacion) => {
  const { cliente, items, total, numero, createdAt, estado } = cotizacion;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 40px; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; }
  th { background: #fd6113; color: #fff; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .total-box { margin-top: 20px; text-align: right; font-size: 16px; font-weight: bold; color: #10b981; }
</style>
</head>
<body>

<h1>Cotización ${numero}</h1>

<div>
  <p><strong>Cliente:</strong> ${cliente?.nombreComercial || ""}</p>
  <p><strong>Fecha:</strong> ${
    createdAt ? new Date(createdAt).toLocaleDateString() : ""
  }</p>
</div>

<table>
<thead>
<tr>
  <th>#</th>
  <th>Producto</th>
  <th>Cant.</th>
  <th>Precio Unit.</th>
  <th>Subtotal</th>
</tr>
</thead>
<tbody>
${items
  .map((item, i) => {
    return ` <tr> <td>${i + 1}</td> <td>${item.producto?.material || item.producto?.servicio || ""} ${
      item.glosa || ""
    }</td> <td>${item.cantidad || 0}</td> <td>S/. ${Number(
      item.precio || 0
    ).toFixed(2)}</td> <td>S/. ${Number(item.subtotal || 0).toFixed(
      2
    )}</td> </tr>`;
  })
  .join("")}
</tbody>
</table>

<div class="total-box">
  TOTAL: S/ ${Number(total || 0).toFixed(2)}
</div>

</body>
</html>
`;
};
