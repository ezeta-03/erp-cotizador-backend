const sgMail = require('@sendgrid/mail');

// Configurar API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.sendActivationEmail = async ({ to, name, token }) => {
  const activationLink = `${process.env.FRONTEND_URL}/activar?token=${token}`;

  const msg = {
    to: to,
    from: process.env.MAIL_FROM, // Debe ser el email verificado en SendGrid
    subject: "Activa tu cuenta - Sistema de Cotización",
    html: `
      <h2>Hola ${name} 👋</h2>
      <p>Has sido invitado a nuestro sistema de cotización.</p>
      <p>Para activar tu cuenta, haz clic en el siguiente enlace:</p>
      <a href="${activationLink}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
        Activar Cuenta
      </a>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="color: #666; font-size: 14px;">${activationLink}</p>
      <p><strong>Este enlace es válido por 24 horas.</strong></p>
      <br/>
      <p style="color: #666;">Saludos,<br/>Equipo de Cotización</p>
    `,
    text: `Hola ${name},\n\nHas sido invitado a nuestro sistema de cotización.\n\nPara activar tu cuenta, visita: ${activationLink}\n\nEste enlace es válido por 24 horas.\n\nSaludos,\nEquipo de Cotización`
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Email enviado exitosamente a ${to}`);
  } catch (error) {
    console.error('❌ Error de SendGrid:', error);
    
    if (error.response) {
      console.error('Detalles del error:', error.response.body);
    }
    
    throw error;
  }
};