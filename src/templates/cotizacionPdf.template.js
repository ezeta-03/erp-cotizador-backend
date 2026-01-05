module.exports = (cotizacion) => {
  const { cliente, items, total, numero, createdAt } = cotizacion;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  body {
    font-family: Arial, sans-serif;
    font-size: 12px;
    color: #000;
    margin: 40px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #fd6113;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }

  .logo img {
    height: 50px;
  }

  .company {
    text-align: right;
    font-size: 11px;
  }

  h1 {
    color: #fd6113;
    margin: 20px 0 10px;
  }

  .info {
    margin-bottom: 20px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
  }

  th {
    background: #fd6113;
    color: #fff;
    padding: 8px;
  }

  td {
    padding: 8px;
    border-bottom: 1px solid #ddd;
  }

  .total-box {
    margin-top: 20px;
    text-align: right;
    font-size: 16px;
    font-weight: bold;
    color: #10b981;
  }

  .benefits {
    background: #f9f9f9;
    border-left: 5px solid #3b82f6;
    padding: 12px;
    margin-top: 25px;
  }

  .conditions {
    font-size: 11px;
    margin-top: 20px;
    color: #555;
  }

  .footer {
    margin-top: 30px;
    text-align: center;
    font-size: 11px;
    color: #555;
  }
</style>
</head>

<body>

<div class="header">
  <div class="logo">
    <img src="file:///${process.cwd()}/public/favicon.png" />
    <img src="http://localhost:4000/favicon.png" />
  </div>
  <div class="company">
    <strong>ZAAZMAGO</strong><br/>
    ventas@zaazmago.com<br/>
    +51 999 999 999
  </div>
</div>

<h1>Cotización ${numero}</h1>

<div class="info">
  <p><strong>Cliente:</strong> ${cliente.nombreComercial}</p>
  <p><strong>Fecha:</strong> ${new Date(createdAt).toLocaleDateString()}</p>
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
  .map(
    (item, i) => `
<tr>
  <td>${i + 1}</td>
  <td>${item.producto.material}</td>
  <td>${item.cantidad}</td>
  <td>${item.precio.toFixed(2)}</td>
  <td>${item.subtotal.toFixed(2)}</td>
</tr>
`
  )
  .join("")}
</tbody>
</table>

<div class="total-box">
  TOTAL: S/ ${total.toFixed(2)}
</div>

<div class="benefits">
  <strong>Esta cotización incluye:</strong>
  <ul>
    <li>✔ Asesoría especializada</li>
    <li>✔ Materiales certificados</li>
    <li>✔ Garantía por escrito</li>
    <li>✔ Soporte post-venta</li>
  </ul>
</div>

<div class="conditions">
  <p><strong>Estado:</strong> ${cotizacion.estado}</p>
  <p><strong>Condiciones comerciales:</strong></p>
  <ul>
    <li>Validez de la oferta: 7 días</li>
    <li>Tiempo de entrega: según disponibilidad</li>
    <li>Forma de pago: a coordinar</li>
  </ul>
</div>

<div class="footer">
  Gracias por confiar en nosotros
</div>

</body>
</html>
`;
};
