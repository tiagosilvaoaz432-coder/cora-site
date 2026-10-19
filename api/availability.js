const { TIMEZONE, listSlots } = require("./google-calendar");

const DAY = 24 * 60 * 60;
const MAX_SPAN = 70 * DAY;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Método não suportado." });
  }

  const url = new URL(req.url, "https://cora-institucional.vercel.app");
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return send(res, 400, { error: "Intervalo de datas inválido." });
  }
  if (from < now - 45 * DAY || to > now + 120 * DAY || to - from > MAX_SPAN) {
    return send(res, 400, { error: "Intervalo de datas fora do período de marcação." });
  }

  try {
    const slots = await listSlots(Math.floor(from), Math.floor(to));
    const duration = slots[0] ? slots[0].duration : 60;
    return send(res, 200, { timezone: TIMEZONE, duration, slots });
  } catch (error) {
    return send(res, 502, { error: "Não foi possível ler os horários do Google Calendar." });
  }
};
