(function () {
  var header = document.querySelector("[data-header]");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("header--scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    /* Altura real do header, para âncoras e para o índice fixo dos Serviços. */
    var syncHeaderH = function () {
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    };
    syncHeaderH();
    if (window.ResizeObserver) new ResizeObserver(syncHeaderH).observe(header);
  }

  var navToggle = document.querySelector("[data-nav-toggle]");
  var navMain = document.querySelector("[data-nav-main]");
  if (navToggle && navMain) {
    var navLabel = navToggle.querySelector(".visually-hidden");
    var setNavOpen = function (open) {
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navMain.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
      if (navLabel) navLabel.textContent = open ? "Fechar menu" : "Abrir menu";
    };

    navToggle.addEventListener("click", function () {
      setNavOpen(navToggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNavOpen(false);
    });

    /* Fecha o menu ao escolher um link (inclui âncoras na mesma página, ex.: Equipa). */
    navMain.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a[href]")) setNavOpen(false);
    });

    document.addEventListener("click", function (e) {
      if (navToggle.getAttribute("aria-expanded") !== "true") return;
      if (navMain.contains(e.target) || navToggle.contains(e.target)) return;
      setNavOpen(false);
    });

    window.addEventListener(
      "resize",
      function () {
        if (window.matchMedia("(min-width: 721px)").matches) setNavOpen(false);
      },
      { passive: true }
    );
  }

  var home = document.querySelector("[data-home]");
  var introGate = home ? home.querySelector("[data-home-intro-gate]") : null;
  var introCanvas = home ? home.querySelector("[data-home-intro-canvas]") : null;
  var processTimeline = document.querySelector("[data-process] .process-timeline");
  var processSteps = processTimeline
    ? processTimeline.querySelectorAll("[data-reveal-toggle]")
    : null;
  var revealEls = document.querySelectorAll(
    "[data-home] .reveal, main.page-sobre .reveal, main.page-servicos .reveal, main.page-recrutamento .reveal"
  );
  var teamSlider = document.querySelector("[data-team-slider]");
  var teamTrack = teamSlider ? teamSlider.querySelector("[data-team-track]") : null;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Em páginas internas: a próxima visita à home (sem reload) salta o intro. */
  var markInternalNav = function () {
    try {
      sessionStorage.setItem("cora-skip-home-intro", "1");
      sessionStorage.removeItem("cora-home-intro-seen");
    } catch (e) {
      /* ignore */
    }
  };

  var getNavType = function () {
    try {
      var nav = performance.getEntriesByType("navigation")[0];
      return nav ? nav.type : "navigate";
    } catch (e) {
      return "navigate";
    }
  };

  var shouldSkipHomeIntro = function () {
    if (getNavType() === "reload") {
      try {
        sessionStorage.removeItem("cora-skip-home-intro");
      } catch (e) {
        /* ignore */
      }
      return false;
    }
    try {
      if (sessionStorage.getItem("cora-skip-home-intro") === "1") return true;
    } catch (e2) {
      /* ignore */
    }
    if (document.referrer) {
      try {
        if (new URL(document.referrer).origin === location.origin) return true;
      } catch (e3) {
        /* ignore */
      }
    }
    return false;
  };

  /* Só esconde o gate nesta pintura; não bloqueia o próximo reload. */
  var dismissHomeIntro = function () {
    document.documentElement.classList.add("home-intro-seen");
  };

  var homeIntroSkipped = false;
  if (home) {
    homeIntroSkipped = shouldSkipHomeIntro();
    if (homeIntroSkipped) {
      dismissHomeIntro();
    } else {
      document.documentElement.classList.remove("home-intro-seen");
      try {
        sessionStorage.removeItem("cora-skip-home-intro");
      } catch (e4) {
        /* ignore */
      }
    }
  } else {
    markInternalNav();
  }

  var servicosIndex = document.querySelector("main.page-servicos .servicos-index");
  if (servicosIndex) {
    var indexLinks = Array.prototype.slice.call(servicosIndex.querySelectorAll("a[href^='#']"));
    var indexTargets = indexLinks
      .map(function (link) {
        var id = link.getAttribute("href").slice(1);
        var panel = id ? document.getElementById(id) : null;
        return panel ? { link: link, panel: panel } : null;
      })
      .filter(Boolean);

    var setActiveIndex = function () {
      if (!indexTargets.length) return;
      var marker = window.innerHeight * 0.35;
      var active = indexTargets[0];
      for (var i = 0; i < indexTargets.length; i++) {
        var top = indexTargets[i].panel.getBoundingClientRect().top;
        if (top <= marker) active = indexTargets[i];
      }
      indexTargets.forEach(function (item) {
        item.link.classList.toggle("is-active", item === active);
      });
    };

    setActiveIndex();
    window.addEventListener("scroll", setActiveIndex, { passive: true });
    window.addEventListener("resize", setActiveIndex);
  }

  if (reduced) {
    if (home) dismissHomeIntro();
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
    if (processTimeline) processTimeline.style.setProperty("--process-progress", "1");
    if (processSteps && processSteps.length) {
      processSteps.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
    return;
  }

  var runHomeIntroPixels = function (canvas, gate) {
    if (!canvas || !canvas.getContext || !gate) return;
    var ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var layout = { drawX: 0, drawY: 0, logoW: 1, logoH: 1, cx: 0, cy: 0 };
    var raf = 0;
    var startedAt = 0;
    var sequenceEnded = false;
    var splitStarted = false;

    var config = {
      logoSrc: "Logótipo svg.svg",
      /* Medido na tinta do SVG (o ficheiro é quadrado, com margem vazia). */
      logoFrameAspect: 377 / 150,
      sampleStep: 4,
      particleSize: 2.1,
      gatherMs: 1750,
      holdMs: 420,
      crossfadeMs: 280,
      /* Igual à transition CSS das metades do gate */
      splitMs: 1150,
      maxParticles: 4200,
      inkThreshold: 232,
      rasterSize: 4096,
    };

    if (home) {
      var introEndMs =
        config.gatherMs + config.holdMs + config.crossfadeMs;
      /* Slogan começa a entrar quando o ecrã abre */
      var sloganGapMs = 120;
      home.style.setProperty(
        "--home-slogan-after-intro",
        (introEndMs + sloganGapMs) / 1000 + "s"
      );
    }

    var setSize = function () {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    var clamp01 = function (x) {
      return x < 0 ? 0 : x > 1 ? 1 : x;
    };

    var easeOutCubic = function (t) {
      t = clamp01(t);
      return 1 - Math.pow(1 - t, 3);
    };

    var easeInOutCubic = function (t) {
      t = clamp01(t);
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    var mulberry32 = function (seed) {
      var t = seed >>> 0;
      return function () {
        t += 0x6d2b79f5;
        var r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    var logoBitmap = null;

    /* Tira o papel claro e enquadra só a tinta (CO:RA + legendas). */
    var prepareLogoSprite = function (img) {
      var iw = img.naturalWidth || 1;
      var ih = img.naturalHeight || 1;
      var sprite = document.createElement("canvas");
      sprite.width = iw;
      sprite.height = ih;
      var sctx = sprite.getContext("2d", { willReadFrequently: true });
      if (!sctx) return null;

      sctx.drawImage(img, 0, 0, iw, ih);
      var imageData = sctx.getImageData(0, 0, iw, ih);
      var data = imageData.data;
      var minX = iw;
      var minY = ih;
      var maxX = -1;
      var maxY = -1;
      var threshold = config.inkThreshold;

      for (var i = 0; i < data.length; i += 4) {
        var lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (data[i + 3] < 28 || lum >= threshold) {
          data[i + 3] = 0;
          continue;
        }
        var p = i >> 2;
        var px = p % iw;
        var py = (p / iw) | 0;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      sctx.putImageData(imageData, 0, 0);

      var crop;
      if (maxX < minX || maxY < minY) {
        crop = { sx: 0, sy: 0, sw: iw, sh: ih };
      } else {
        var inkW = maxX - minX + 1;
        var inkH = maxY - minY + 1;
        var padX = Math.max(8, Math.round(inkW * 0.045));
        var padY = Math.max(6, Math.round(inkH * 0.08));
        var sx = Math.max(0, minX - padX);
        var sy = Math.max(0, minY - padY);
        crop = {
          sx: sx,
          sy: sy,
          sw: Math.min(iw - sx, inkW + padX * 2),
          sh: Math.min(ih - sy, inkH + padY * 2),
        };
      }

      config.logoFrameAspect = crop.sw / Math.max(1, crop.sh);

      var tight = document.createElement("canvas");
      tight.width = Math.max(1, Math.ceil(crop.sw));
      tight.height = Math.max(1, Math.ceil(crop.sh));
      var tctx = tight.getContext("2d");
      if (!tctx) return { canvas: sprite, crop: crop };
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(
        sprite,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        tight.width,
        tight.height
      );
      return {
        canvas: tight,
        crop: { sx: 0, sy: 0, sw: tight.width, sh: tight.height },
      };
    };

    var loadSharpSvg = function (onReady, onFail) {
      fetch(config.logoSrc)
        .then(function (res) {
          if (!res.ok) throw new Error("logo");
          return res.text();
        })
        .then(function (svgText) {
          var pixelSize = config.rasterSize;
          var sized = svgText
            .replace(/<!DOCTYPE[\s\S]*?>/i, "")
            .replace(/<svg\b[\s\S]*?>/i, function (tag) {
              var viewBox = /viewBox="([^"]+)"/.exec(tag);
              var vb = viewBox ? viewBox[1] : "0 0 1254 1254";
              return (
                '<svg xmlns="http://www.w3.org/2000/svg" width="' +
                pixelSize +
                '" height="' +
                pixelSize +
                '" viewBox="' +
                vb +
                '" preserveAspectRatio="xMidYMid meet">'
              );
            });
          var blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
          var url = URL.createObjectURL(blob);
          var image = new Image();
          image.onload = function () {
            URL.revokeObjectURL(url);
            onReady(image);
          };
          image.onerror = function () {
            URL.revokeObjectURL(url);
            onFail();
          };
          image.src = url;
        })
        .catch(function () {
          onFail();
        });
    };

    var getLogoLayout = function (w, h) {
      var logoW = Math.min(w * 0.78, 832);
      if (w >= 720) logoW = Math.max(logoW, Math.min(352, w * 0.58));
      logoW = Math.min(logoW, w * 0.92);
      var logoH = logoW / Math.max(0.001, config.logoFrameAspect);
      var cx = w / 2;
      var cy = h / 2;
      return {
        drawX: cx - logoW / 2,
        drawY: cy - logoH / 2,
        logoW: logoW,
        logoH: logoH,
        cx: cx,
        cy: cy,
      };
    };

    var buildParticlesFromImage = function () {
      if (!logoBitmap) return [];
      var img = logoBitmap.canvas;
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, rect.width);
      var h = Math.max(1, rect.height);
      layout = getLogoLayout(w, h);
      layout.sourceCrop = logoBitmap.crop;

      var off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(layout.logoW));
      off.height = Math.max(1, Math.floor(layout.logoH));
      var octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return [];

      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.clearRect(0, 0, off.width, off.height);
      var cr = layout.sourceCrop;
      octx.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, off.width, off.height);

      var imageData = octx.getImageData(0, 0, off.width, off.height);
      var data = imageData.data;

      var step = Math.max(2, config.sampleStep);
      var targets = [];
      for (var y = 0; y < off.height; y += step) {
        for (var x = 0; x < off.width; x += step) {
          var i = (y * off.width + x) * 4;
          var a = data[i + 3];
          if (a < 28) continue;
          targets.push({
            x: layout.drawX + x,
            y: layout.drawY + y,
            a: a / 255,
          });
        }
      }

      if (!targets.length) return [];

      var count = targets.length;
      if (count > config.maxParticles) {
        var takeEvery = Math.ceil(count / config.maxParticles);
        var reducedTargets = [];
        for (var t = 0; t < count; t += takeEvery) reducedTargets.push(targets[t]);
        targets = reducedTargets;
      }

      var rand = mulberry32(1337);
      var built = new Array(targets.length);
      for (var p = 0; p < targets.length; p++) {
        var target = targets[p];
        var angle = rand() * Math.PI * 2;
        var radius = (Math.min(w, h) * 0.45) * (0.25 + rand() * 0.95);
        var sx = layout.cx + Math.cos(angle) * radius + (rand() - 0.5) * 80;
        var sy = layout.cy + Math.sin(angle) * radius + (rand() - 0.5) * 80;
        built[p] = {
          sx: sx,
          sy: sy,
          tx: target.x,
          ty: target.y,
          jitter: rand() * 2.5,
          alpha: 0.4 + 0.6 * target.a,
        };
      }
      return built;
    };

    var tCrossfadeStart = config.gatherMs + config.holdMs;
    var tCrossfadeEnd = tCrossfadeStart + config.crossfadeMs;

    var finishGate = function () {
      gate.classList.add("is-done");
      dismissHomeIntro();
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch (e2) {
        /* ignore */
      }
    };

    var syncPanelLogos = function () {
      if (!logoBitmap || !logoBitmap.canvas) return;
      var dataUrl;
      try {
        dataUrl = logoBitmap.canvas.toDataURL("image/png");
      } catch (e) {
        return;
      }
      var logos = gate.querySelectorAll(".home-intro-gate__logo");
      for (var i = 0; i < logos.length; i++) {
        logos[i].src = dataUrl;
        logos[i].style.aspectRatio =
          config.logoFrameAspect > 0 ? String(config.logoFrameAspect) : "377 / 150";
      }
    };

    var openSplit = function () {
      if (splitStarted) return;
      splitStarted = true;
      sequenceEnded = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;

      syncPanelLogos();
      gate.classList.add("is-logo-ready");
      /* Força reflow para a transição das metades arrancar a seguir */
      void gate.offsetWidth;
      gate.classList.add("is-opening");

      window.setTimeout(finishGate, config.splitMs + 40);
    };

    var abortIntro = function () {
      sequenceEnded = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      gate.classList.add("is-logo-ready", "is-opening", "is-done");
      dismissHomeIntro();
    };

    var render = function (now) {
      if (sequenceEnded) return;
      if (!startedAt) startedAt = now;
      var t = now - startedAt;

      var gatherT = clamp01(t / config.gatherMs);
      var progress = easeOutCubic(gatherT);
      var crossU = clamp01((t - tCrossfadeStart) / config.crossfadeMs);
      var crossEase = easeInOutCubic(crossU);
      var particleMult = 1 - crossEase;
      var bitmapAlpha = crossEase;

      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      if (particles.length && particleMult > 0.001) {
        ctx.save();
        ctx.fillStyle = "#000000";
        for (var i = 0; i < particles.length; i++) {
          var pt = particles[i];
          var x = pt.sx + (pt.tx - pt.sx) * progress;
          var y = pt.sy + (pt.ty - pt.sy) * progress;
          if (gatherT < 1) {
            x += Math.sin(now * 0.012 + i) * pt.jitter * (1 - gatherT);
            y += Math.cos(now * 0.011 + i) * pt.jitter * (1 - gatherT);
          }
          ctx.globalAlpha = particleMult * pt.alpha;
          ctx.fillRect(x, y, config.particleSize, config.particleSize);
        }
        ctx.restore();
      }

      if (bitmapAlpha > 0.001 && logoBitmap) {
        ctx.save();
        ctx.globalAlpha = bitmapAlpha;
        var crB = layout.sourceCrop;
        ctx.drawImage(
          logoBitmap.canvas,
          crB.sx,
          crB.sy,
          crB.sw,
          crB.sh,
          layout.drawX,
          layout.drawY,
          layout.logoW,
          layout.logoH
        );
        ctx.restore();
      }

      if (t >= tCrossfadeEnd) {
        openSplit();
        return;
      }

      raf = window.requestAnimationFrame(render);
    };

    setSize();

    loadSharpSvg(
      function (image) {
        logoBitmap = prepareLogoSprite(image);
        if (!logoBitmap) {
          abortIntro();
          return;
        }
        particles = buildParticlesFromImage();
        startedAt = 0;
        sequenceEnded = false;
        canvas.style.visibility = "visible";
        raf = window.requestAnimationFrame(render);
      },
      function () {
        abortIntro();
      }
    );

    var onResize = function () {
      if (sequenceEnded || splitStarted) return;
      setSize();
      if (logoBitmap) {
        particles = buildParticlesFromImage();
      }
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", function () {
      if (!splitStarted) abortIntro();
    }, { once: true });
  };

  if (introCanvas && introGate && !homeIntroSkipped) {
    runHomeIntroPixels(introCanvas, introGate);
  } else if (introGate && homeIntroSkipped) {
    introGate.classList.add("is-done");
  }

  /* Ao sair da home para outra página do site, marca navegação interna. */
  if (home) {
    document.addEventListener(
      "click",
      function (e) {
        var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        var href = a.getAttribute("href");
        if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) {
          return;
        }
        try {
          var url = new URL(a.href, location.href);
          if (url.origin !== location.origin) return;
          var file = url.pathname.split("/").pop() || "";
          var isHome = file === "" || file === "index.html";
          if (!isHome) markInternalNav();
        } catch (err) {
          /* ignore */
        }
      },
      true
    );
  }

  if (revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            return;
          }

          if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-reveal-toggle")) return;
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    revealEls.forEach(function (el) {
      io.observe(el);
    });
  }

  if (processTimeline) {
    var processTicking = false;

    var clamp01 = function (x) {
      return x < 0 ? 0 : x > 1 ? 1 : x;
    };

    var renderProcess = function () {
      var rect = processTimeline.getBoundingClientRect();
      var viewportCenter = window.innerHeight * 0.5;
      var available = Math.max(rect.height, 1);
      var progress = (viewportCenter - rect.top) / available;
      var p = clamp01(progress);
      processTimeline.style.setProperty("--process-progress", p.toFixed(4));

      if (processSteps && processSteps.length) {
        for (var i = 0; i < processSteps.length; i++) {
          var el = processSteps[i];
          var stepRect = el.getBoundingClientRect();
          var stepCenter = stepRect.top + stepRect.height * 0.5;
          var stepP = (stepCenter - rect.top) / available;
          if (stepP <= p + 0.01) el.classList.add("is-visible");
          else el.classList.remove("is-visible");
        }
      }
      processTicking = false;
    };

    var onProcessScroll = function () {
      if (processTicking) return;
      processTicking = true;
      window.requestAnimationFrame(renderProcess);
    };

    renderProcess();
    window.addEventListener("scroll", onProcessScroll, { passive: true });
    window.addEventListener("resize", renderProcess);
  }

  if (teamTrack && teamTrack.children.length > 1) {
    var slideCount = teamTrack.children.length;
    var teamIdx = 0;
    window.setInterval(function () {
      teamIdx = (teamIdx + 1) % slideCount;
      teamTrack.style.transform = "translateX(-" + (teamIdx * (100 / slideCount)) + "%)";
    }, 3000);
  }

  var equipaTabs = document.querySelector("[data-equipa-tabs]");
  if (equipaTabs) {
    var tabButtons = Array.prototype.slice.call(
      equipaTabs.querySelectorAll("[data-equipa-tab]")
    );
    var tabPanels = Array.prototype.slice.call(
      equipaTabs.querySelectorAll("[data-equipa-panel]")
    );

    var activateEquipaTab = function (id, focusTab) {
      tabButtons.forEach(function (btn) {
        var selected = btn.getAttribute("data-equipa-tab") === id;
        btn.classList.toggle("is-active", selected);
        btn.setAttribute("aria-selected", selected ? "true" : "false");
        btn.tabIndex = selected ? 0 : -1;
        if (selected && focusTab) btn.focus();
      });
      tabPanels.forEach(function (panel) {
        var active = panel.getAttribute("data-equipa-panel") === id;
        panel.classList.toggle("is-active", active);
        if (active) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      });
    };

    tabButtons.forEach(function (btn, index) {
      btn.addEventListener("click", function () {
        activateEquipaTab(btn.getAttribute("data-equipa-tab"), false);
      });

      btn.addEventListener("keydown", function (e) {
        var nextIndex = index;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          nextIndex = (index + 1) % tabButtons.length;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        } else if (e.key === "Home") {
          nextIndex = 0;
        } else if (e.key === "End") {
          nextIndex = tabButtons.length - 1;
        } else {
          return;
        }
        e.preventDefault();
        activateEquipaTab(tabButtons[nextIndex].getAttribute("data-equipa-tab"), true);
      });
    });
  }
})();
