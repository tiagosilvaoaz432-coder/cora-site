(function () {
  var header = document.querySelector("[data-header]");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("header--scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var home = document.querySelector("[data-home]");
  var introCanvas = home ? home.querySelector("[data-home-intro-canvas]") : null;
  var spinSection = home ? home.querySelector("[data-spin-section]") : null;
  var processTimeline = document.querySelector("[data-process] .process-timeline");
  var processSteps = processTimeline
    ? processTimeline.querySelectorAll("[data-reveal-toggle]")
    : null;
  var revealEls = document.querySelectorAll("[data-home] .reveal, main.page-sobre .reveal, main.page-servicos .reveal");
  var teamSlider = document.querySelector("[data-team-slider]");
  var teamTrack = teamSlider ? teamSlider.querySelector("[data-team-track]") : null;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
    if (spinSection) spinSection.style.setProperty("--spin-progress", "1");
    if (processTimeline) processTimeline.style.setProperty("--process-progress", "1");
    if (processSteps && processSteps.length) {
      processSteps.forEach(function (el) {
        el.classList.add("is-visible");
      });
    }
    return;
  }

  var runHomeIntroPixels = function (canvas) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var layout = { drawX: 0, drawY: 0, logoW: 1, logoH: 1, cx: 0, cy: 0 };
    var raf = 0;
    var startedAt = 0;
    var sequenceEnded = false;

    var config = {
      logoSrc: "completo.svg",
      /* Enquadramento do lockup na home (igual ao aspect-ratio em .home-intro-logo). */
      logoFrameAspect: 250 / 85,
      sampleStep: 5,
      particleSize: 2.1,
      gatherMs: 1750,
      holdMs: 160,
      crossfadeMs: 780,
      maxParticles: 2600,
    };

    /* Igual à duração em CSS: .home-intro-logo.home-intro-logo--exit */
    var LOGO_EXIT_MS = 2000;
    if (home) {
      var introEndMs =
        config.gatherMs + config.holdMs + config.crossfadeMs + LOGO_EXIT_MS;
      /* Pausa após o logo antes da entrada do slogan (CSS .home-slogan__word). */
      var sloganGapMs = 700;
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

    var easeInCubic = function (t) {
      t = clamp01(t);
      return t * t * t;
    };

    var easeInPow11 = function (t) {
      t = clamp01(t);
      return Math.pow(t, 11);
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

    var getSourceCrop = function (img, frameAspect) {
      var iw = img.naturalWidth || 1;
      var ih = img.naturalHeight || 1;
      var srcAspect = iw / ih;
      if (Math.abs(srcAspect - frameAspect) < 0.01) {
        return { sx: 0, sy: 0, sw: iw, sh: ih };
      }
      if (srcAspect > frameAspect) {
        var sh = ih;
        var sw = sh * frameAspect;
        return { sx: (iw - sw) / 2, sy: 0, sw: sw, sh: sh };
      }
      var sw = iw;
      var sh = sw / frameAspect;
      return { sx: 0, sy: (ih - sh) / 2, sw: sw, sh: sh };
    };

    var getLogoLayout = function (w, h) {
      var logoW = Math.min(Math.max(352, w * 0.58), 832);
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

    var buildParticlesFromImage = function (img) {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, rect.width);
      var h = Math.max(1, rect.height);
      layout = getLogoLayout(w, h);
      layout.sourceCrop = getSourceCrop(img, config.logoFrameAspect);

      var off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(layout.logoW));
      off.height = Math.max(1, Math.floor(layout.logoH));
      var octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return [];

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
    var tExitStart = tCrossfadeEnd;
    var tExitEnd = tExitStart + LOGO_EXIT_MS;

    var finishCanvasIntro = function () {
      if (sequenceEnded) return;
      sequenceEnded = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      try {
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      } catch (e) {
        /* ignore */
      }
      canvas.style.visibility = "hidden";
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch (e2) {
        /* ignore */
      }
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

      if (bitmapAlpha > 0.001 && img && img.naturalWidth && t < tExitStart) {
        ctx.save();
        ctx.globalAlpha = bitmapAlpha;
        var crB = layout.sourceCrop;
        ctx.drawImage(
          img,
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

      if (t >= tExitStart && img && img.naturalWidth) {
        var exitU = clamp01((t - tExitStart) / LOGO_EXIT_MS);
        /* ease-in t¹¹: escala, fade, blur e drift; aceleração forte no fim. */
        var exitEase = easeInPow11(exitU);
        var exitScale = 1 + 21 * exitEase;
        var exitAlpha = 1 - exitEase;
        var exitBlur = 8 * exitEase;

        ctx.save();
        ctx.globalAlpha = exitAlpha;
        ctx.filter = "blur(" + exitBlur.toFixed(2) + "px)";
        var cw = canvas.width / dpr;
        var ch = canvas.height / dpr;
        var exitDriftX = Math.min(cw * 0.3, 520);
        var exitDriftY = Math.min(ch * 0.455, 700);
        ctx.translate(
          layout.cx - exitDriftX * exitEase,
          layout.cy - exitDriftY * exitEase
        );
        ctx.scale(exitScale, exitScale);
        var crE = layout.sourceCrop;
        ctx.drawImage(
          img,
          crE.sx,
          crE.sy,
          crE.sw,
          crE.sh,
          -layout.logoW / 2,
          -layout.logoH / 2,
          layout.logoW,
          layout.logoH
        );
        ctx.restore();
      }

      if (t >= tExitEnd) {
        finishCanvasIntro();
        return;
      }

      raf = window.requestAnimationFrame(render);
    };

    var stop = function () {
      sequenceEnded = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      ctx && ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      canvas.style.visibility = "hidden";
    };

    setSize();

    var img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = config.logoSrc;
    img.onload = function () {
      particles = buildParticlesFromImage(img);
      startedAt = 0;
      sequenceEnded = false;
      canvas.style.visibility = "visible";
      raf = window.requestAnimationFrame(render);
    };
    img.onerror = function () {
      stop();
    };

    var onResize = function () {
      if (sequenceEnded) return;
      setSize();
      if (img && img.complete && img.naturalWidth) {
        particles = buildParticlesFromImage(img);
      }
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", stop, { once: true });
  };

  if (introCanvas) runHomeIntroPixels(introCanvas);

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

  if (spinSection) {
    var spinLogo = spinSection.querySelector("[data-spin-logo]");
    var spinStartDocY = null;
    var measureSpinStart = function () {
      if (spinLogo) {
        var logoRect = spinLogo.getBoundingClientRect();
        spinStartDocY = window.scrollY + logoRect.top + logoRect.height * 0.5;
        return;
      }
      var fallbackRect = spinSection.getBoundingClientRect();
      spinStartDocY = window.scrollY + fallbackRect.top + fallbackRect.height * 0.5;
    };
    var ticking = false;
    var renderSpin = function () {
      var available = Math.max(spinSection.offsetHeight - window.innerHeight, 1);
      /* < 1: rotação 0→1 com menos scroll (ex.: 0.5 ≈ metade da distância). */
      var spinScrollEase = 0.5;
      var effectiveRange = Math.max(available * spinScrollEase, 1);
      if (spinStartDocY === null) measureSpinStart();
      /* Só anima depois do centro do viewport passar a posição inicial do logo. */
      var viewportMidDocY = window.scrollY + window.innerHeight * 0.5;
      var progress = (viewportMidDocY - spinStartDocY) / effectiveRange;

      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;

      spinSection.style.setProperty("--spin-progress", progress.toFixed(4));
      ticking = false;
    };

    var onSpinScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(renderSpin);
    };
    var onSpinResize = function () {
      measureSpinStart();
      renderSpin();
    };

    measureSpinStart();
    renderSpin();
    window.addEventListener("scroll", onSpinScroll, { passive: true });
    window.addEventListener("resize", onSpinResize);
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
})();
