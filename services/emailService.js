const sgMail = require("@sendgrid/mail");
require("dotenv").config();

// Set API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendInvitationEmail = async (email, inviteLink) => {
  try {
    const msg = {
      to: email,
      from: process.env.EMAIL_FROM, // must be verified in SendGrid
      subject: "You are invited to join!",
      html: `
        <h2>Welcome to our platform!</h2>
        <p>Hi ${email},</p>
        <p>You have been invited to join. Click the link below to accept or reject the invitation:</p>
        <p>
          <a href="${inviteLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Click here to respond
          </a>
        </p>
        <p>If the button doesn't work, you can also visit this link:</p>
        <p>${inviteLink}</p>
        <p>This link will expire in 15 minutes.</p>
        <p>Best regards,<br>The Team</p>
      `,
    };

    const response = await sgMail.send(msg);

    console.log("✅ Email sent:", response[0].statusCode);
    return true;
  } catch (error) {
    console.error("❌ Error sending email:", error.response?.body || error);
    throw error;
  }
};

module.exports = {
  sendInvitationEmail,
};