(function () {
  var root = document.querySelector("[data-booking]");
  if (!root) return;

  var TZ = "Europe/Lisbon";
  var WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  var GOOGLE_BOOKING = "https://calendar.app.google/YiY36qwUvgDznJas5";

  var state = {
    year: 0,
    month: 0,
    slots: {},
    duration: 60,
    selectedDay: "",
    selectedStart: 0,
  };
  var loadToken = 0;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parts(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    var map = {};
    fmt.formatToParts(date).forEach(function (part) {
      map[part.type] = part.value;
    });
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
    };
  }

  function dayKey(year, month, day) {
    return year + "-" + pad(month) + "-" + pad(day);
  }

  function todayKey() {
    var now = parts(new Date());
    return dayKey(now.year, now.month, now.day);
  }

  function weekdayMonday(year, month, day) {
    var date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    var name = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
    }).format(date);
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return (map[name] + 6) % 7;
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function lisbonStartUnix(year, month, day) {
    var guess = Date.UTC(year, month - 1, day, 0, 0, 0);
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (var hour = -36; hour <= 36; hour += 1) {
      var instant = new Date(guess + hour * 3600000);
      var map = {};
      fmt.formatToParts(instant).forEach(function (part) {
        map[part.type] = part.value;
      });
      if (
        Number(map.year) === year &&
        Number(map.month) === month &&
        Number(map.day) === day &&
        map.hour === "00" &&
        map.minute === "00"
      ) {
        return Math.floor(instant.getTime() / 1000);
      }
    }
    return Math.floor(guess / 1000);
  }

  function slotKey(start) {
    var keyParts = parts(new Date(start * 1000));
    return dayKey(keyParts.year, keyParts.month, keyParts.day);
  }

  function sentence(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatMonth(year, month) {
    var label = new Intl.DateTimeFormat("pt-PT", {
      timeZone: TZ,
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
    return sentence(label);
  }

  function formatDay(key) {
    var bits = key.split("-");
    var date = new Date(Date.UTC(Number(bits[0]), Number(bits[1]) - 1, Number(bits[2]), 12));
    return sentence(new Intl.DateTimeFormat("pt-PT", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date));
  }

  function formatTime(start) {
    return new Intl.DateTimeFormat("pt-PT", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(start * 1000));
  }

  function monthIndex(year, month) {
    return year * 12 + (month - 1);
  }

  function canGoPrev() {
    var now = parts(new Date());
    return monthIndex(state.year, state.month) > monthIndex(now.year, now.month);
  }

  function canGoNext() {
    var now = parts(new Date());
    return monthIndex(state.year, state.month) < monthIndex(now.year, now.month) + 3;
  }

  function shiftMonth(delta) {
    var month = state.month + delta;
    var year = state.year;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    if (month > 12) {
      month = 1;
      year += 1;
    }
    state.year = year;
    state.month = month;
    state.selectedDay = "";
    state.selectedStart = 0;
    load();
  }

  function shell() {
    root.innerHTML =
      '<div class="cal__panel">' +
      '<div class="cal__month">' +
      '<div class="cal__month-bar">' +
      '<button type="button" class="cal__nav" data-cal-prev aria-label="Mês anterior">‹</button>' +
      '<h3 class="cal__month-label" data-cal-month></h3>' +
      '<button type="button" class="cal__nav" data-cal-next aria-label="Mês seguinte">›</button>' +
      "</div>" +
      '<div class="cal__weekdays" aria-hidden="true">' +
      WEEKDAYS.map(function (day) {
        return "<span>" + day + "</span>";
      }).join("") +
      "</div>" +
      '<div class="cal__grid" data-cal-grid role="group" aria-label="Dias do mês"></div>' +
      "</div>" +
      '<div class="cal__side">' +
      '<p class="cal__meta" data-cal-meta>60 min · hora de Lisboa</p>' +
      '<div class="cal__day-bar"><h3 class="cal__day-label" data-cal-day>Escolhe um dia</h3></div>' +
      '<div class="cal__slots" data-cal-slots></div>' +
      '<form class="cal__form" data-cal-form hidden>' +
      '<div class="cal__names">' +
      field("firstName", "Nome", "text", true, "given-name", 80) +
      field("lastName", "Apelido", "text", true, "family-name", 80) +
      "</div>" +
      field("email", "Email", "email", true, "email", 120) +
      field("phone", "Telefone", "tel", true, "tel", 40) +
      field("company", "Empresa (se constituída)", "text", false, "organization", 160) +
      '<div><label for="cal-message">O que queres tratar</label>' +
      '<textarea id="cal-message" name="message" maxlength="1000"></textarea></div>' +
      '<label class="visually-hidden" for="cal-website">Website</label>' +
      '<input class="visually-hidden" id="cal-website" name="website" tabindex="-1" autocomplete="off">' +
      '<p class="cal__alert" data-cal-alert hidden></p>' +
      '<div class="cal__actions">' +
      '<button type="submit" class="cal__submit" data-cal-submit>Confirmar reunião</button>' +
      '<button type="button" class="cal__text-btn" data-cal-clear>Escolher outro horário</button>' +
      "</div>" +
      "</form>" +
      '<div class="cal__done" data-cal-done hidden>' +
      "<h3>Reunião marcada</h3>" +
      '<p data-cal-done-copy></p>' +
      "</div>" +
      "</div>" +
      "</div>";

    root.querySelector("[data-cal-prev]").addEventListener("click", function () {
      if (canGoPrev()) shiftMonth(-1);
    });
    root.querySelector("[data-cal-next]").addEventListener("click", function () {
      if (canGoNext()) shiftMonth(1);
    });
    root.querySelector("[data-cal-form]").addEventListener("submit", onSubmit);
    root.querySelector("[data-cal-clear]").addEventListener("click", function () {
      state.selectedStart = 0;
      render();
    });
  }

  function field(name, label, type, required, auto, max) {
    return (
      "<div><label for=\"cal-" + name + "\">" + label + "</label>" +
      "<input id=\"cal-" + name + "\" name=\"" + name + "\" type=\"" + type + "\" autocomplete=\"" + auto + "\"" +
      (required ? " required" : "") +
      ' maxlength="' + max + '"></div>'
    );
  }

  function render() {
    root.querySelector("[data-cal-month]").textContent = formatMonth(state.year, state.month);
    root.querySelector("[data-cal-prev]").disabled = !canGoPrev();
    root.querySelector("[data-cal-next]").disabled = !canGoNext();
    root.querySelector("[data-cal-meta]").textContent = state.duration + " min · hora de Lisboa";

    var grid = root.querySelector("[data-cal-grid]");
    grid.replaceChildren();
    var count = daysInMonth(state.year, state.month);
    var lead = weekdayMonday(state.year, state.month, 1);
    var today = todayKey();
    var index;
    for (index = 0; index < lead; index += 1) {
      var empty = document.createElement("span");
      empty.className = "cal__empty";
      grid.appendChild(empty);
    }
    for (var day = 1; day <= count; day += 1) {
      var key = dayKey(state.year, state.month, day);
      var open = (state.slots[key] || []).length > 0;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cal__day-btn";
      button.textContent = String(day);
      button.disabled = key < today || !open;
      button.setAttribute("aria-pressed", key === state.selectedDay ? "true" : "false");
      button.setAttribute("aria-label", formatDay(key) + (open ? "" : ", sem horários"));
      if (open) button.setAttribute("data-open", "true");
      if (key === today) button.setAttribute("data-today", "true");
      button.addEventListener("click", function (eventKey) {
        return function () {
          state.selectedDay = eventKey;
          state.selectedStart = 0;
          root.querySelector("[data-cal-done]").hidden = true;
          render();
        };
      }(key));
      grid.appendChild(button);
    }

    var dayLabel = root.querySelector("[data-cal-day]");
    var slotsHost = root.querySelector("[data-cal-slots]");
    var form = root.querySelector("[data-cal-form]");
    slotsHost.replaceChildren();

    if (!state.selectedDay) {
      dayLabel.textContent = "Escolhe um dia";
      var hint = document.createElement("p");
      hint.className = "cal__empty-day";
      hint.textContent = "Os dias com hora livre estão assinalados.";
      slotsHost.appendChild(hint);
      form.hidden = true;
      return;
    }

    dayLabel.textContent = formatDay(state.selectedDay);
    var daySlots = state.slots[state.selectedDay] || [];
    if (!daySlots.length) {
      var none = document.createElement("p");
      none.className = "cal__empty-day";
      none.textContent = "Sem horários neste dia.";
      slotsHost.appendChild(none);
      form.hidden = true;
      return;
    }

    daySlots.forEach(function (slot) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cal__slot";
      button.textContent = formatTime(slot.start);
      button.setAttribute("aria-pressed", slot.start === state.selectedStart ? "true" : "false");
      button.setAttribute("aria-label", formatDay(state.selectedDay) + " às " + formatTime(slot.start));
      button.addEventListener("click", function () {
        state.selectedStart = slot.start;
        root.querySelector("[data-cal-done]").hidden = true;
        root.querySelector("[data-cal-alert]").hidden = true;
        render();
      });
      slotsHost.appendChild(button);
    });

    form.hidden = !state.selectedStart;
  }

  function showError(message) {
    root.replaceChildren();
    var box = document.createElement("div");
    box.className = "cal__error";
    var copy = document.createElement("p");
    copy.textContent = message;
    var retryWrap = document.createElement("p");
    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "cal__retry";
    retry.textContent = "Tentar de novo";
    retry.addEventListener("click", function () {
      shell();
      load();
    });
    retryWrap.appendChild(retry);
    var linkWrap = document.createElement("p");
    var link = document.createElement("a");
    link.className = "cal__fallback";
    link.href = GOOGLE_BOOKING;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir a marcação Google";
    linkWrap.appendChild(link);
    box.append(copy, retryWrap, linkWrap);
    root.appendChild(box);
  }

  async function load() {
    var token = ++loadToken;
    var from = lisbonStartUnix(state.year, state.month, 1);
    var last = daysInMonth(state.year, state.month);
    var to = lisbonStartUnix(state.year, state.month, last) + 24 * 60 * 60;
    try {
      var response = await fetch("/api/availability?from=" + from + "&to=" + to);
      var data = await response.json();
      if (token !== loadToken) return;
      if (!response.ok) throw new Error(data.error || "fail");
      var grouped = {};
      (data.slots || []).forEach(function (slot) {
        var key = slotKey(slot.start);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(slot);
      });
      Object.keys(grouped).forEach(function (key) {
        grouped[key].sort(function (a, b) {
          return a.start - b.start;
        });
      });
      state.slots = grouped;
      state.duration = data.duration || 60;
      if (!state.selectedDay || !(state.slots[state.selectedDay] || []).length) {
        var keys = Object.keys(state.slots)
          .filter(function (key) {
            return key >= todayKey() && key.indexOf(dayKey(state.year, state.month, 1).slice(0, 7)) === 0;
          })
          .sort();
        state.selectedDay = keys[0] || "";
        state.selectedStart = 0;
      }
      render();
    } catch (error) {
      if (token !== loadToken) return;
      showError("Não foi possível carregar os horários livres.");
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var alert = root.querySelector("[data-cal-alert]");
    var submit = root.querySelector("[data-cal-submit]");
    alert.hidden = true;
    submit.disabled = true;
    submit.textContent = "A reservar…";
    var payload = {
      start: state.selectedStart,
      firstName: form.firstName.value,
      lastName: form.lastName.value,
      email: form.email.value,
      phone: form.phone.value,
      company: form.company.value,
      message: form.message.value,
      website: form.website.value,
    };
    try {
      var response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (response.status === 409) {
        alert.textContent = data.error || "Esse horário já não está livre.";
        alert.hidden = false;
        state.selectedStart = 0;
        await load();
        return;
      }
      if (response.status === 503 && data.code === "unconfigured") {
        form.hidden = true;
        var done = root.querySelector("[data-cal-done]");
        done.hidden = false;
        done.querySelector("h3").textContent = "Horário livre, falta confirmar";
        done.querySelector("[data-cal-done-copy]").textContent =
          formatDay(state.selectedDay) +
          " às " +
          formatTime(state.selectedStart) +
          " está livre. A reserva automática ainda não está ligada a esta conta Google, por isso confirma na marcação do Google.";
        if (!done.querySelector("[data-cal-google]")) {
          var link = document.createElement("a");
          link.className = "cal__fallback";
          link.href = GOOGLE_BOOKING;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.dataset.calGoogle = "true";
          link.textContent = "Confirmar no Google Calendar";
          done.appendChild(link);
        }
        return;
      }
      if (!response.ok) {
        alert.textContent = data.error || "Não foi possível reservar. Tenta de novo.";
        alert.hidden = false;
        return;
      }
      form.hidden = true;
      var success = root.querySelector("[data-cal-done]");
      var leftover = success.querySelector("[data-cal-google]");
      if (leftover) leftover.remove();
      success.hidden = false;
      success.querySelector("h3").textContent = "Reunião marcada";
      var end = state.selectedStart + state.duration * 60;
      var whenLine =
        formatDay(state.selectedDay) +
        ", " +
        formatTime(state.selectedStart) +
        "–" +
        formatTime(end) +
        ".";
      if (data.emailSent) {
        success.querySelector("[data-cal-done-copy]").textContent =
          whenLine + " Enviámos a confirmação para " + payload.email.trim() + " (inclui anexo para o calendário).";
      } else {
        success.querySelector("[data-cal-done-copy]").textContent =
          whenLine +
          " A reunião ficou no nosso calendário; se não receberes email em breve, confirma connosco em cora.ucp@gmail.com.";
      }
    } catch (error) {
      alert.textContent = "Não foi possível reservar. Tenta de novo.";
      alert.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "Confirmar reunião";
    }
  }

  var now = parts(new Date());
  state.year = now.year;
  state.month = now.month;
  shell();
  load();
})();
