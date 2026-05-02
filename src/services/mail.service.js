const https = require("https");

exports.sendActivationEmail = async ({ to, name, token }) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://erp-zaazmago.web.app";
  const activationLink = `${frontendUrl}/activar?token=${token}`;
  const senderEmail = (process.env.MAIL_FROM || "academiazenteno@gmail.com").trim();

  console.log("📧 Enviando correo con Brevo:");
  console.log("   sender:", senderEmail);
  console.log("   to:", to);
  console.log("   api-key presente:", !!process.env.BREVO_API_KEY);

  const body = JSON.stringify({
    sender: {
      name: "Sistema ZAAZMAGO",
      email: senderEmail,
    },
    to: [{ email: to }],
    subject: "Activa tu cuenta — Sistema de Cotización ZAAZMAGO",
    htmlContent: `
     Put your HTML text here<div style="font-family: Arial, sans-serif; background: #f4f6f9; padding: 24px 0; color: #111;">
        <div style="width: 100%; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08); overflow: hidden;">
          <div style="padding: 28px 28px 18px; border-bottom: 1px solid #e5e7eb; background: #fff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="https://zaaz-actividades.web.app/logo_black.svg" alt="ZAAZMAGO" style="height: 40px; width: auto;" />
            </div>
            <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #111; opacity: 0.65; margin-bottom: 14px;">Sistema de Cotización</div>
            <h2 style="margin: 0 0 10px; font-size: 28px; line-height: 1.15;">Hola, ${name} 👋</h2>
            <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.7;">
              Has sido invitado al sistema de cotización de <strong>ZAAZMAGO</strong>. Crea tu contraseña y activa tu cuenta para comenzar a gestionar cotizaciones de forma rápida.
            </p>
          </div>

          <div style="padding: 24px 28px 32px;">
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 12px; color: #374151; font-size: 14px; line-height: 1.7;">Tu enlace de activación está listo. Haz clic en el botón y completa el formulario para establecer tu contraseña.</p>
              <a href="${activationLink}"
           style="display: inline-block; margin: 20px 0; padding: 12px 28px;
                  background: #111; color: #fff; text-decoration: none;
                  border-radius: 6px; font-weight: 600; font-size: 15px;">
          Activar mi cuenta
        </a>
            </div>

            <div style="font-size: 13px; color: #6b7280; line-height: 1.7;">
              <p style="margin: 0 0 8px;">O copia y pega este enlace en tu navegador:</p>
              <p style="margin: 0; word-break: break-all;"><a href="${activationLink}" style="color: #111111; text-decoration: none;">${activationLink}</a></p>
            </div>

            <p style="margin: 20px 0 0; font-size: 13px; color: #9ca3af;">Este enlace es válido por 24 horas.</p>
          </div>

          <div style="padding: 18px 28px 26px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">ZAAZMAGO — Sistema de Cotización</p>
          </div>
        </div>
      </div>
    `,
    textContent: `Hola ${name},\n\nFuiste invitado al sistema de cotización de ZAAZMAGO.\n\nActiva tu cuenta aquí: ${activationLink}\n\nEste enlace es válido por 24 horas.`,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ Email de activación enviado a ${to}`);
            resolve();
          } else {
            reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};
