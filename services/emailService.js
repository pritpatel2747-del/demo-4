const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendInvitationEmail = async (email, inviteLink) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "You are invited to join!",
      html: `
        <h2>Welcome to our platform!</h2>
        <p>Hi ${email},</p>
        <p>You have been invited to join. Click the link below to accept or reject the invitation:</p>
        <p><a href="${inviteLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Click here to respond</a></p>
        <p>If the button doesn't work, you can also visit this link:</p>
        <p>${inviteLink}</p>
        <p>This link will expire in 15 minutes.</p>
        <p>Best regards,<br>The Team</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = {
  sendInvitationEmail,
};
