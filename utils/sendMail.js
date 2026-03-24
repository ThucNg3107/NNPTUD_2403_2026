const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: process.env.MAILTRAP_USER || "",
        pass: process.env.MAILTRAP_PASS || "",
    },
});

module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: 'admin@haha.com',
            to: to,
            subject: "reset password email",
            text: "click vao day de doi pass", // Plain-text version of the message
            html: "click vao <a href=" + url+ ">day</a> de doi pass", // HTML version of the message
        })
    },
    sendNewUserPasswordMail: async function (to, username, password) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || 'admin@haha.com',
            to: to,
            subject: "Thong tin tai khoan moi",
            text: `Tai khoan cua ban da duoc tao.\nUsername: ${username}\nPassword: ${password}\nVui long doi mat khau sau khi dang nhap.`,
            html: `<p>Tai khoan cua ban da duoc tao.</p>
                   <p><strong>Username:</strong> ${username}</p>
                   <p><strong>Password:</strong> ${password}</p>
                   <p>Vui long doi mat khau sau khi dang nhap.</p>`,
        });
    }
}

// Send an email using async/await
