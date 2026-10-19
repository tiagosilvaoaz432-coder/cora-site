const crypto = require("crypto");
const { TIMEZONE, listSlots, loadServiceAccount, calendarId } = require("./google-calendar");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (error) {
      return Promise.resolve(null);
    }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 20_000) {
        resolve(null);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function clean(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function accessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = header + "." + claim;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer
    .sign(creds.private_key)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + signature,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error("auth");
    error.status = response.status;
    throw error;
  }
  return payload.access_token;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Método não suportado." });
  }

  const body = await readBody(req);
  if (!body || typeof body !== "object") {
    return send(res, 400, { error: "Pedido inválido." });
  }
  if (clean(body.website, 80)) {
    return send(res, 400, { error: "Pedido inválido." });
  }

  const start = Number(body.start);
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 120);
  const phone = clean(body.phone, 40);
  const company = clean(body.company, 160);
  const message = clean(body.message, 1000);

  if (!Number.isFinite(start) || !firstName || !lastName) {
    return send(res, 400, { error: "Indica o nome e um horário." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return send(res, 400, { error: "O email não parece válido." });
  }
  if (phone.replace(/\D/g, "").length < 6) {
    return send(res, 400, { error: "Indica um telefone de contacto." });
  }

  const creds = loadServiceAccount();
  if (!creds) {
    return send(res, 503, {
      code: "unconfigured",
      error: "A reserva automática no Google Calendar ainda não está ligada.",
    });
  }

  let slot;
  try {
    const slots = await listSlots(start - 60, start + 60 * 60);
    slot = slots.find((item) => item.start === start);
  } catch (error) {
    return send(res, 502, { error: "Não foi possível confirmar o horário no Google Calendar." });
  }
  if (!slot) {
    return send(res, 409, { error: "Esse horário já não está livre. Escolhe outro." });
  }

  const description = [
    "Pedido pelo site CO:RA.",
    "",
    "Nome: " + firstName + " " + lastName,
    "Email: " + email,
    "Telefone: " + phone,
    company ? "Empresa: " + company : "",
    message ? "Nota: " + message : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const token = await accessToken(creds);
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/" +
        encodeURIComponent(calendarId()) +
        "/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "Reunião CO:RA — " + firstName + " " + lastName,
          description,
          start: {
            dateTime: new Date(start * 1000).toISOString(),
            timeZone: TIMEZONE,
          },
          end: {
            dateTime: new Date((start + slot.duration * 60) * 1000).toISOString(),
            timeZone: TIMEZONE,
          },
          attendees: [{ email }],
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (response.status === 403 || response.status === 404) {
      return send(res, 503, {
        code: "unconfigured",
        error: "O Google Calendar ainda não autoriza reservas a partir do site.",
      });
    }
    if (!response.ok) {
      return send(res, 502, { error: "Não foi possível reservar esse horário. Tenta outro." });
    }
    const event = await response.json().catch(() => ({}));
    return send(res, 200, {
      ok: true,
      start,
      duration: slot.duration,
      htmlLink: event.htmlLink || "",
    });
  } catch (error) {
    return send(res, 502, { error: "Não foi possível reservar esse horário. Tenta de novo." });
  }
};
