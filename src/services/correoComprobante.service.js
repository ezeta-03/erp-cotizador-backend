// Envío de comprobantes electrónicos al cliente por correo (Brevo, el mismo
// servicio de las invitaciones), con el PDF, el XML firmado y el CDR adjuntos.
const numeroALetras = require("../utils/numeroALetras");

const TITULO = { FACTURA: "Factura", BOLETA: "Boleta de venta", NOTA_CREDITO: "Nota de crédito", NOTA_DEBITO: "Nota de débito" };
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function enviarComprobantePorCorreo({ para, comprobante: c, emisor, adjuntos }) {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const remitente = (process.env.MAIL_FROM || "").trim();
  if (!apiKey || !remitente) {
    const e = new Error("Correo sin configurar: faltan BREVO_API_KEY o MAIL_FROM");
    e.status = 503;
    throw e;
  }

  const titulo = `${TITULO[c.tipo]} electrónica ${c.numero}`;
  const simbolo = c.moneda === "USD" ? "US$" : "S/";
  const total = `${simbolo} ${Number(c.total).toFixed(2)}`;

  let res;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        sender: { email: remitente, name: emisor.nombreComercial || emisor.razonSocial },
        to: para.map((email) => ({ email })),
        subject: `${titulo} — ${emisor.nombreComercial || emisor.razonSocial}`,
        textContent: `Estimado cliente ${c.clienteNombre}:\n\nAdjuntamos la ${titulo.toLowerCase()} por ${total} (${numeroALetras(c.total, c.moneda)}).\n` +
          `Se adjuntan la representación impresa (PDF), el XML firmado y la constancia de recepción de SUNAT (CDR).\n\n` +
          `${emisor.razonSocial} — RUC ${emisor.ruc}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; color: #111; max-width: 560px;">
            <p>Estimado cliente <strong>${esc(c.clienteNombre)}</strong>:</p>
            <p>Adjuntamos la <strong>${esc(titulo.toLowerCase())}</strong> por <strong>${esc(total)}</strong>.</p>
            <p>Se adjuntan la representación impresa (PDF), el XML firmado y la constancia de recepción de SUNAT (CDR).
               Puede verificar su validez en www.sunat.gob.pe.</p>
            <p style="color: #6b7280; font-size: 13px;">${esc(emisor.razonSocial)} — RUC ${esc(emisor.ruc)}</p>
          </div>`,
        attachment: adjuntos.map((a) => ({ name: a.nombre, content: a.contenido.toString("base64") })),
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

module.exports = { enviarComprobantePorCorreo };
