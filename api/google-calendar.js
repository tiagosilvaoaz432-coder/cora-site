const SCHEDULE_ID =
  "AcZssZ2yiiTZY1ll9F1yCfubkLdYNYe27vwoul5IfW752fYkY69AZR1hLBmNdsZKG7-h0NDCRPAOMYSY";
const API_KEY = "AIzaSyA7GKm43l8WNxlLTjsldq9z9n80CL6KW4U";
const TIMEZONE = "Europe/Lisbon";
const ORGANIZER_EMAIL = "cora.ucp@gmail.com";

function rpcUrl(method) {
  const headerBlob =
    "X-Goog-Api-Key:" +
    API_KEY +
    "\r\nContent-Type:application/json+protobuf\r\nX-User-Agent:grpc-web-javascript/0.1\r\n";
  return (
    "https://calendar-pa.clients6.google.com/$rpc/google.internal.calendar.v1.AppointmentBookingService/" +
    method +
    "?$httpHeaders=" +
    encodeURIComponent(headerBlob)
  );
}

function parseSlots(payload) {
  const slots = [];
  const visit = (node) => {
    if (!Array.isArray(node)) return;
    const stamp = node[0] && node[0][0];
    const duration = Number(node[1]);
    if (typeof stamp === "string" && Number.isFinite(Number(stamp)) && Number.isFinite(duration)) {
      slots.push({ start: Number(stamp), duration: duration || 60 });
      return;
    }
    node.forEach(visit);
  };
  visit(payload);
  return slots;
}

async function listSlots(from, to) {
  const response = await fetch(rpcUrl("ListAvailableSlots"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json+protobuf",
      "X-Goog-Api-Key": API_KEY,
      Origin: "https://calendar.google.com",
      Referer: "https://calendar.google.com/calendar/appointments/schedules/" + SCHEDULE_ID,
    },
    body: JSON.stringify([null, null, SCHEDULE_ID, null, [[from], [to]]]),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) {
    const error = new Error("slots_unavailable");
    error.status = response.status;
    throw error;
  }
  if (payload.length && typeof payload[0] === "number" && typeof payload[1] === "string") {
    const error = new Error("slots_unavailable");
    error.status = 502;
    throw error;
  }
  return parseSlots(payload);
}

function loadServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (error) {
    return null;
  }
  if (!creds.client_email || !creds.private_key) return null;
  creds.private_key = String(creds.private_key).replace(/\\n/g, "\n");
  return creds;
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || ORGANIZER_EMAIL;
}

module.exports = {
  SCHEDULE_ID,
  TIMEZONE,
  ORGANIZER_EMAIL,
  listSlots,
  loadServiceAccount,
  calendarId,
};
