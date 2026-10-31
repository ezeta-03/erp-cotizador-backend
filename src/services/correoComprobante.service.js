// Envío de comprobantes electrónicos al cliente por correo (Brevo, el mismo
// servicio de las invitaciones), con el PDF, el XML firmado y el CDR adjuntos.
const numeroALetras = require("../utils/numeroALetras");

const TITULO = { FACTURA: "Factura", BOLETA: "Boleta de venta", NOTA_CREDITO: "Nota de crédito", NOTA_DEBITO: "Nota de débito" };
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Envío por la API de Brevo. adjuntos: [{ nombre, contenido: Buffer }].
async function enviarBrevo({ para, remitenteNombre, asunto, texto, html, adjuntos = [] }) {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const remitente = (process.env.MAIL_FROM || "").trim();
  if (!apiKey || !remitente) {
    const e = new Error("Correo sin configurar: faltan BREVO_API_KEY o MAIL_FROM");
    e.status = 503;
    throw e;
  }

  let res;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        sender: { email: remitente, name: remitenteNombre },
        to: para.map((email) => ({ email })),
        subject: asunto,
        textContent: texto,
        htmlContent: html,
        ...(adjuntos.length && { attachment: adjuntos.map((a) => ({ name: a.nombre, content: a.contenido.toString("base64") })) }),
      }),
    });
  } catch (error) {
    const e = new Error(`No se pudo conectar con el servicio de correo: ${error.message}`);
    e.status = 502;
    throw e;
  }
  if (!res.ok) {
    // Brevo explica el motivo en { code, message } (p. ej. remitente no validado).
    const detalle = await res.json().then((j) => j.message).catch(() => null);
    const e = new Error(`No se pudo enviar el correo: ${detalle || `Brevo respondió HTTP ${res.status}`}`);
    e.status = 502;
    throw e;
  }
}

async function enviarComprobantePorCorreo({ para, comprobante: c, emisor, adjuntos }) {
  const titulo = `${TITULO[c.tipo]} electrónica ${c.numero}`;
  const simbolo = c.moneda === "USD" ? "US$" : "S/";
  const total = `${simbolo} ${Number(c.total).toFixed(2)}`;

  await enviarBrevo({
    para,
    remitenteNombre: emisor.nombreComercial || emisor.razonSocial,
    asunto: `${titulo} — ${emisor.nombreComercial || emisor.razonSocial}`,
    texto: `Estimado cliente ${c.clienteNombre}:\n\nAdjuntamos la ${titulo.toLowerCase()} por ${total} (${numeroALetras(c.total, c.moneda)}).\n` +
      `Se adjuntan la representación impresa (PDF), el XML firmado y la constancia de recepción de SUNAT (CDR).\n\n` +
      `${emisor.razonSocial} — RUC ${emisor.ruc}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111; max-width: 560px;">
        <p>Estimado cliente <strong>${esc(c.clienteNombre)}</strong>:</p>
        <p>Adjuntamos la <strong>${esc(titulo.toLowerCase())}</strong> por <strong>${esc(total)}</strong>.</p>
        <p>Se adjuntan la representación impresa (PDF), el XML firmado y la constancia de recepción de SUNAT (CDR).
           Puede verificar su validez en www.sunat.gob.pe.</p>
        <p style="color: #6b7280; font-size: 13px;">${esc(emisor.razonSocial)} — RUC ${esc(emisor.ruc)}</p>
      </div>`,
    adjuntos,
  });
}

// Recordatorio de pago: los documentos con saldo del cliente, con su
// vencimiento. documentos: [{ numero, fechaEmision (aaaa-mm-dd), vencimiento, moneda, saldo, diasVencido }].
async function enviarRecordatorioCobro({ para, clienteNombre, documentos, emisor, cuenta }) {
  const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
  const importe = (m, v) => `${m === "USD" ? "US$" : "S/"} ${Number(v).toFixed(2)}`;
  const totales = {};
  for (const d of documentos) totales[d.moneda] = (totales[d.moneda] || 0) + d.saldo;
  const total = Object.entries(totales).map(([m, v]) => importe(m, v)).join(" + ");
  const vencidos = documentos.some((d) => d.diasVencido > 0);
  const nombre = emisor.nombreComercial || emisor.razonSocial;

  const filas = documentos.map((d) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(d.numero)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${fecha(d.fechaEmision)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${fecha(d.vencimiento)}${d.diasVencido > 0 ? ` <span style="color:#b91c1c">(vencido hace ${d.diasVencido} d)</span>` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${importe(d.moneda, d.saldo)}</td>
    </tr>`).join("");

  await enviarBrevo({
    para,
    remitenteNombre: nombre,
    asunto: `${vencidos ? "Recordatorio de pago vencido" : "Recordatorio de pago"} — ${nombre}`,
    texto: `Estimado cliente ${clienteNombre}:\n\nLe recordamos que tiene pendiente de pago ${total}:\n` +
      documentos.map((d) => `- ${d.numero}: ${importe(d.moneda, d.saldo)}, vence ${fecha(d.vencimiento)}`).join("\n") +
      (cuenta ? `\n\nPuede abonar en: ${cuenta}` : "") +
      `\n\nSi ya realizó el pago, por favor ignore este mensaje.\n\n${emisor.razonSocial} — RUC ${emisor.ruc}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111; max-width: 620px;">
        <p>Estimado cliente <strong>${esc(clienteNombre)}</strong>:</p>
        <p>Le recordamos que tiene pendiente de pago <strong>${esc(total)}</strong>, según el detalle:</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <thead><tr style="background:#f3f4f6;text-align:left">
            <th style="padding:6px 8px">Comprobante</th><th style="padding:6px 8px">Emisión</th>
            <th style="padding:6px 8px">Vencimiento</th><th style="padding:6px 8px;text-align:right">Saldo</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        ${cuenta ? `<p>Puede abonar en: <strong>${esc(cuenta)}</strong></p>` : ""}
        <p>Si ya realizó el pago, por favor ignore este mensaje.</p>
        <p style="color: #6b7280; font-size: 13px;">${esc(emisor.razonSocial)} — RUC ${esc(emisor.ruc)}</p>
      </div>`,
  });
}

module.exports = { enviarComprobantePorCorreo, enviarRecordatorioCobro };
