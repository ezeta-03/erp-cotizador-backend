module.exports = (cotizacion) => {
  const { cliente, items, total, margen, numero, createdAt } = cotizacion;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      color: #333;
    }
    h1 {
      text-align: center;
    }
    .header, .footer {
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px;
      text-align: left;
    }
    th {
      background: #f5f5f5;
    }
    .total {
      text-align: right;
      font-weight: bold;
      margin-top: 15px;
    }
  </style>
</head>
<body>

  <h1>Cotización ${numero}</h1>

  <div class="header">
    <p><strong>Cliente:</strong> ${cliente.nombre}</p>
    <p><strong>Documento:</strong> ${cliente.documento || "-"}</p>
    <p><strong>Fecha:</strong> ${new Date(createdAt).toLocaleDateString()}</p>
    <p><strong>Margen:</strong> ${margen}%</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Producto</th>
        <th>Cantidad</th>
        <th>Precio</th>
        <th>Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${item.producto.nombre}</td>
          <td>${item.cantidad}</td>
          <td>${item.precio.toFixed(2)}</td>
          <td>${item.subtotal.toFixed(2)}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>

  <p class="total">TOTAL: ${total.toFixed(2)}</p>

  <div class="footer">
    <p>Gracias por su preferencia</p>
  </div>

</body>
</html>
`;
};
