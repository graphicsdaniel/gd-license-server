// ============================================================
//  GD AUTO COUNT — Gumroad License Key Server
//  Vercel Serverless Function
//  POST /api/ping  ← set this as your Gumroad Ping URL
// ============================================================

const nodemailer = require("nodemailer");

// ── Same key generation logic as the .jsx script ────────────
const SECRET_SALT = process.env.SECRET_SALT;

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0x7fffffff;
  }
  return hash;
}

function generateKey(orderId) {
  const raw = hashString(SECRET_SALT + orderId.toUpperCase().replace(/\s/g, ""));
  let hex   = raw.toString(16).toUpperCase();
  while (hex.length < 8) hex = "0" + hex;
  return "GD-" + hex.substr(0, 4) + "-" + hex.substr(4, 4);
}

// ── Email template ───────────────────────────────────────────
function buildEmail(customerName, key, downloadUrl) {
  return {
    subject: "Your GD AUTO COUNT Serial Key 🎉",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: -apple-system, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .wrap { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .header { background: #1c1c1e; padding: 28px 32px; text-align: center; }
    .header h1 { color: #4caf7d; font-size: 22px; margin: 0; letter-spacing: 0.06em; }
    .header p  { color: #888; font-size: 12px; margin: 6px 0 0; }
    .body { padding: 28px 32px; }
    .body p { color: #444; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
    .key-box { background: #1c1c1e; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
    .key-box .label { color: #888; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
    .key-box .key { color: #4caf7d; font-size: 22px; font-weight: 700; letter-spacing: 0.12em; font-family: monospace; }
    .steps { background: #f9f9f9; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
    .steps p { margin: 0 0 8px; font-size: 13px; color: #333; font-weight: 600; }
    .steps ol { margin: 0; padding-left: 18px; color: #555; font-size: 13px; line-height: 1.8; }
    .btn { display: block; width: fit-content; margin: 20px auto; background: #4caf7d; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; }
    .footer { text-align: center; padding: 16px; color: #aaa; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>GD AUTO COUNT</h1>
      <p>by @graphicsdaniel</p>
    </div>
    <div class="body">
      <p>Hey ${customerName || "there"} 👋</p>
      <p>Thanks for purchasing <strong>GD AUTO COUNT</strong>! Here's your serial key:</p>

      <div class="key-box">
        <div class="label">Your Serial Key</div>
        <div class="key">${key}</div>
      </div>

      <div class="steps">
        <p>How to activate:</p>
        <ol>
          <li>Download and install the script in AE's <strong>ScriptUI Panels</strong> folder</li>
          <li>Open After Effects → Window → <strong>GD AUTO COUNT</strong></li>
          <li>Enter your serial key when prompted</li>
          <li>Click <strong>Activate</strong> — done! ✓</li>
        </ol>
      </div>

      <p>Keep this key safe — it's tied to your purchase.</p>

      ${downloadUrl ? `<a class="btn" href="${downloadUrl}">Download Script →</a>` : ""}

      <p style="font-size:12px;color:#aaa;">Questions? Reply to this email or DM me on X: <a href="https://x.com/graphicsdaniel1" style="color:#4caf7d;">@graphicsdaniel</a></p>
    </div>
    <div class="footer">© graphicsdaniel · GD AUTO COUNT v1.0</div>
  </div>
</body>
</html>
    `,
    text: `
Hey ${customerName || "there"},

Thanks for purchasing GD AUTO COUNT!

Your serial key: ${key}

How to activate:
1. Install the script in AE's ScriptUI Panels folder
2. Open After Effects > Window > GD AUTO COUNT
3. Enter your serial key when prompted
4. Click Activate

Questions? DM me on X: @graphicsdaniel
    `.trim()
  };
}

// ── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Gumroad sends form-encoded data
    const body = req.body || {};

    // Gumroad Ping fields
    const email       = body.email        || body.purchaser_email || "";
    const firstName   = body.first_name   || body.full_name?.split(" ")[0] || "";
    const orderId     = body.sale_id      || body.order_id || body.subscription_id || Date.now().toString();
    const productName = body.product_name || "GD AUTO COUNT";
    const downloadUrl = body.product_permalink ? `https://gumroad.com/l/${body.product_permalink}` : "";

    if (!email) {
      return res.status(400).json({ error: "No email found in payload" });
    }

    // Generate key from order ID
    const key = generateKey(orderId);

    // Send email via Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const emailContent = buildEmail(firstName, key, downloadUrl);

    await transporter.sendMail({
      from: `"graphicsdaniel" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    console.log(`Key sent to ${email}: ${key} (order: ${orderId})`);
    return res.status(200).json({ success: true, email, key });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
