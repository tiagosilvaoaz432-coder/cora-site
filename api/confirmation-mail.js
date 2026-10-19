const nodemailer = require("nodemailer");
const { TIMEZONE, ORGANIZER_EMAIL } = require("./google-calendar");

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsUtc(unixSeconds) {
  const iso = new Date(unixSeconds * 1000).toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatWhen(start, durationMinutes) {
  const startDate = new Date(start * 1000);
  const endDate = new Date((start + durationMinutes * 60) * 1000);
  const day = new Intl.DateTimeFormat("pt-PT", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(startDate);
  const time = new Intl.DateTimeFormat("pt-PT", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return day.charAt(0).toUpperCase() + day.slice(1) + ", " + time.format(startDate) + " – " + time.format(endDate);
}

function buildIcs({ start, durationMinutes, summary, description }) {
  const end = start + durationMinutes * 60;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CO:RA//Site//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + start + "-cora-site@cora-institucional",
    "DTSTAMP:" + toIcsUtc(Math.floor(Date.now() / 1000)),
    "DTSTART:" + toIcsUtc(start),
    "DTEND:" + toIcsUtc(end),
    "SUMMARY:" + escapeIcs(summary),
    "DESCRIPTION:" + escapeIcs(description),
    "ORGANIZER;CN=CO:RA:mailto:" + ORGANIZER_EMAIL,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function mailConfig() {
  const user = process.env.BOOKING_MAIL_USER || ORGANIZER_EMAIL;
  const pass = process.env.BOOKING_MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, pass };
}

async function sendBookingConfirmation(details) {
  const config = mailConfig();
  if (!config) return false;

  const when = formatWhen(details.start, details.durationMinutes);
  const summary = "Reunião CO:RA — " + details.firstName + " " + details.lastName;
  const plain = [
    "Olá " + details.firstName + ",",
    "",
    "A tua reunião com a CO:RA ficou marcada.",
    "",
    "Quando: " + when + " (hora de Lisboa)",
    "Duração: " + details.durationMinutes + " minutos",
    "",
    "Se precisares de alterar ou cancelar, responde a este email.",
    "",
    "CO:RA · Junior iniciativa · UCP",
    ORGANIZER_EMAIL,
  ].join("\n");

  const html =
    '<div style="font-family:Outfit,Segoe UI,sans-serif;color:#161616;line-height:1.55;max-width:32rem">' +
    "<p>Olá <strong>" +
    details.firstName +
    "</strong>,</p>" +
    "<p>A tua reunião com a <strong>CO:RA</strong> ficou marcada.</p>" +
    '<p style="margin:1.25rem 0;padding:1rem 1.1rem;border:1px solid #e7e1d8;border-radius:16px;background:#fffcf8">' +
    "<strong>" +
    when +
    "</strong><br>" +
    details.durationMinutes +
    " minutos · hora de Lisboa</p>" +
    "<p>Em anexo vai um ficheiro <em>.ics</em> para adicionares ao teu calendário.</p>" +
    "<p>Se precisares de alterar ou cancelar, responde a este email.</p>" +
    '<p style="color:#8a837a;font-size:0.9rem;margin-top:1.5rem">CO:RA · Junior iniciativa · UCP</p>' +
    "</div>";

  const ics = buildIcs({
    start: details.start,
    durationMinutes: details.durationMinutes,
    summary,
    description: plain,
  });

  const fromName = process.env.BOOKING_MAIL_FROM_NAME || "CO:RA";
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transport.sendMail({
    from: fromName + " <" + config.user + ">",
    to: details.email,
    replyTo: ORGANIZER_EMAIL,
    subject: "Reunião CO:RA confirmada — " + when,
    text: plain,
    html,
    attachments: [
      {
        filename: "reuniao-cora.ics",
        content: ics,
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      },
    ],
  });

  return true;
}

module.exports = { sendBookingConfirmation, formatWhen };
