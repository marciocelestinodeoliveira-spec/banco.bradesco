import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const validTokens = new Set(["ABC123"]); // você pode mudar depois

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.get("/", (req, res) => res.send("OK"));

<html>
<body style="font-family:Arial;padding:16px;">
<h2>Compartilhar localização</h2>
<p>Toque no botão para enviar sua localização.</p>
<button onclick="send()">Enviar minha localização</button>
<pre id="out"></pre>
<script>
function send(){
  if(!navigator.geolocation){ out.textContent="Não suportado"; return; }
  out.textContent="Obtendo localização...";
  navigator.geolocation.getCurrentPosition(async p=>{
    const r = await fetch("/api/location",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        token:"${req.params.token}",
        lat:p.coords.latitude,
        lon:p.coords.longitude,
        acc:p.coords.accuracy,
        ts:Date.now()
      })
    });
    out.textContent = r.ok ? "Enviado com sucesso ✅" : "Erro ❌";
  },e=>out.textContent=e.message,{enableHighAccuracy:true});
}
</script>
</body>
</html>`);
});

app.post("/api/location", async (req, res) => {
  const { token, lat, lon, acc, ts } = req.body;
  if (!validTokens.has(token)) return res.sendStatus(403);

  const maps = `https://www.google.com/maps?q=${lat},${lon}`;

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: process.env.TO_EMAIL,
    subject: "📍 Localização recebida",
    text: `Token: ${token}
Data: ${new Date(ts).toISOString()}
Latitude: ${lat}
Longitude: ${lon}
Precisão: ${acc} m
Maps: ${maps}`
  });

  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Servidor rodando");
});
