import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Troque/adicione tokens aqui
const validTokens = new Set(["ABC123"]);

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const transporter = nodemailer.createTransport({
  host: must("SMTP_HOST"),
  port: Number(must("SMTP_PORT")),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
  auth: {
    user: must("SMTP_USER"),
    pass: must("SMTP_PASS"),
  },
});

app.get("/", (req, res) => res.send("OK"));

app.get("/loc/:token", (req, res) => {
  const { token } = req.params;
  if (!validTokens.has(token)) return res.status(404).send("Link inválido.");

  // ⚠️ HTML precisa estar dentro de string (aqui usamos template string com crases)
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Compartilhar localização</title>
</head>
<body style="font-family:Arial; padding:16px; max-width:640px; margin:auto;">
  <h2>Compartilhar localização</h2>
  <p>Toque no botão para enviar sua localização. (O navegador pode pedir permissão.)</p>

  <button id="btn" style="padding:12px 16px; font-size:16px;">Enviar minha localização</button>
  <pre id="out" style="margin-top:16px; white-space:pre-wrap;"></pre>

<script>
  const out = document.getElementById("out");
  document.getElementById("btn").onclick = async () => {
    if (!navigator.geolocation) {
      out.textContent = "Geolocalização não suportada.";
      return;
    }

    out.textContent = "Obtendo localização...";
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const payload = {
        token: "${token}",
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: pos.coords.accuracy,
        ts: Date.now()
      };

      const r = await fetch("/api/location", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
      });

      out.textContent = r.ok ? "Enviado com sucesso ✅" : ("Falha ao enviar ❌ (" + r.status + ")");
    }, (err) => {
      out.textContent = "Erro/permissão: " + err.message;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
</script>
</body>
</html>`);
});

app.post("/api/location", async (req, res) => {
  const { token, lat, lon, acc, ts } = req.body || {};
  if (!token || !validTokens.has(token)) return res.status(403).json({ ok: false });
  if (typeof lat !== "number" || typeof lon !== "number") return res.status(400).json({ ok: false });

  const maps = `https://www.google.com/maps?q=${lat},${lon}`;
  const when = new Date(ts || Date.now()).toISOString();

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL || must("SMTP_USER"),
      to: must("TO_EMAIL"),
      subject: `📍 Localização recebida (${token})`,
      text:
`Token: ${token}
Quando: ${when}
Latitude: ${lat}
Longitude: ${lon}
Precisão: ${acc ?? "n/a"} m
Maps: ${maps}`
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("email_failed", e);
    res.status(500).json({ ok: false, error: "email_failed" });
  }
});

// Render gosta do host 0.0.0.0
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Server up");
});
