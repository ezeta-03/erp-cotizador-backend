const nodemailer = require("nodemailer");

const crearTransporter = () =>
  nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.MAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

exports.sendActivationEmail = async ({ to, name, token }) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://erp-zaazmago.web.app";
  const activationLink = `${frontendUrl}/activar?token=${token}`;

  const transporter = crearTransporter();

  await transporter.sendMail({
    from: `"Sistema ZAAZMAGO" <${process.env.MAIL_USER}>`,
    to,
    subject: "Activa tu cuenta — Sistema de Cotización ZAAZMAGO",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 4px;">Hola, ${name} 👋</h2>
        <p style="color: #555;">Has sido invitado al sistema de cotización de <strong>ZAAZMAGO</strong>.</p>
        <p style="color: #555;">Haz clic en el botón para crear tu contraseña y activar tu cuenta:</p>
        <a href="${activationLink}"
           style="display: inline-block; margin: 20px 0; padding: 12px 28px;
                  background: #111; color: #fff; text-decoration: none;
                  border-radius: 6px; font-weight: 600; font-size: 15px;">
          Activar mi cuenta
        </a>
        <p style="font-size: 13px; color: #888;">
          O copia este enlace en tu navegador:<br/>
          <a href="${activationLink}" style="color: #555;">${activationLink}</a>
        </p>
        <p style="font-size: 13px; color: #aaa;">Este enlace es válido por 24 horas.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #bbb;">ZAAZMAGO — Sistema de Cotización</p>
      </div>
    `,
    text: `Hola ${name},\n\nFuiste invitado al sistema de cotización de ZAAZMAGO.\n\nActiva tu cuenta aquí: ${activationLink}\n\nEste enlace es válido por 24 horas.`,
  });

  console.log(`✅ Email de activación enviado a ${to}`);
};
