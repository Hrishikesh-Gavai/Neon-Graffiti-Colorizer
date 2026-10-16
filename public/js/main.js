/* =========================================================================
   Neon Graffiti - main.js
   - hero photo carousel (Swiper, with a small built-in fallback)
   - studio: upload, settings, /api/colorize, scan-line reveal, before/after
   ========================================================================= */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const API = "/api/colorize";
  const MAX_BYTES = Math.floor(4.4 * 1024 * 1024);
  const MAX_PIXELS = 24_000_000;
  const SLIDE_MS = 6000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad2 = (n) => String(n).padStart(2, "0");
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const fmtBytes = (b) => (b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

  function tween(ms, fn, ease = (t) => t) {
    return new Promise((resolve) => {
      if (reduceMotion || ms <= 0) { fn(1); return resolve(); }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        fn(ease(t));
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  let toastTimer;
  function toast(msg, tone = "ok") {
    const el = $("#toast");
    el.className = `toast glass ${tone}`;
    el.innerHTML = tone === "err" ? '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><span></span>' : "<span></span>";
    el.querySelector("span").textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), tone === "err" ? 6000 : 2400);
  }

  /* =============================================================== HERO */
  function initHero() {
    const root = $("#heroSwiper");
    const slides = $$(".swiper-slide", root);
    const bar = $("#heroBar");
    const credit = $("#credit");
    $("#slideAll").textContent = pad2(slides.length);

    let barAnim = null;
    function runBar() {
      if (barAnim) barAnim.cancel();
      if (reduceMotion) return;
      barAnim = bar.animate([{ width: "0%" }, { width: "100%" }], { duration: SLIDE_MS, easing: "linear", fill: "forwards" });
    }
    function show(i) {
      const s = slides[i];
      $("#slideNow").textContent = pad2(i + 1);
      credit.textContent = `Photo: ${s.dataset.credit}`;
      credit.href = s.dataset.href;
      runBar();
    }

    if (window.Swiper) {
      const swiper = new window.Swiper(root, {
        loop: true,
        effect: "fade",
        fadeEffect: { crossFade: true },
        speed: 1400,
        autoplay: reduceMotion ? false : { delay: SLIDE_MS, disableOnInteraction: false, pauseOnMouseEnter: false },
        keyboard: { enabled: true, onlyInViewport: true },
        allowTouchMove: true,
        on: {
          init(sw) { show(sw.realIndex); },
          slideChange(sw) { show(sw.realIndex); },
        },
      });
      $("#heroPrev").addEventListener("click", () => swiper.slidePrev());
      $("#heroNext").addEventListener("click", () => swiper.slideNext());
      return;
    }

    // fallback cross-fade when the Swiper script could not load
    let i = 0, timer;
    const go = (n) => {
      slides[i].classList.remove("is-active");
      i = (n + slides.length) % slides.length;
      slides[i].classList.add("is-active");
      const img = $("img", slides[i]);
      if (img.loading === "lazy") img.loading = "eager";
      show(i);
      clearTimeout(timer);
      if (!reduceMotion) timer = setTimeout(() => go(i + 1), SLIDE_MS);
    };
    $("#heroPrev").addEventListener("click", () => go(i - 1));
    $("#heroNext").addEventListener("click", () => go(i + 1));
    go(0);
  }

  /* ============================================================= STUDIO */
  const form = $("#paintForm");
  const fileInput = $("#fileInput");
  const drop = $("#drop");
  const paintBtn = $("#paintBtn");
  const stage = $("#stage");
  const outBar = $("#outBar");
  const compare = $('[data-compare="out"]');

  const state = { name: "", upload: null, beforeURL: "", afterURL: "", w: 0, h: 0, busy: false };

  // sliders
  [["#depth", "#depthOut"], ["#saturation", "#satOut"]].forEach(([i, o]) => {
    const input = $(i), out = $(o);
    const sync = () => {
      input.style.setProperty("--p", `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
      out.textContent = Number(input.value).toFixed(2);
    };
    input.addEventListener("input", sync);
    sync();
  });

  // number field with custom stepper buttons (press and hold repeats)
  const seed = $("#seed");
  const clampSeed = (v) => Math.max(0, Math.min(999999, Math.round(Number(v) || 0)));
  $$(".steps button").forEach((btn) => {
    let hold, rep;
    const bump = () => { seed.value = clampSeed(Number(seed.value) + Number(btn.dataset.step)); };
    const stop = () => { clearTimeout(hold); clearInterval(rep); };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      bump();
      hold = setTimeout(() => (rep = setInterval(bump, 60)), 380);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, stop));
  });
  seed.addEventListener("change", () => (seed.value = clampSeed(seed.value)));
  const shuffleSeed = () => (seed.value = Math.floor(Math.random() * 999999));
  $("#remix").addEventListener("click", shuffleSeed);

  // compare slider + scan-line reveal
  const sliderReady = window.customElements
    ? Promise.race([customElements.whenDefined("img-comparison-slider"), sleep(4000)])
    : Promise.resolve();

  function setSlider(v) {
    const s = $("#outSlider");
    s.setAttribute("value", String(v));
    try { s.value = v; } catch (_) { /* not upgraded yet */ }
  }

  async function paintReveal(afterSrc, beforeSrc) {
    const reveal = $(".reveal", compare);
    const img = $("img", reveal);
    const line = $(".scanline", reveal);
    await sliderReady;
    setSlider(0);
    if (reduceMotion) { setSlider(50); return; }

    img.src = afterSrc;
    reveal.style.setProperty("--before-src", `url("${beforeSrc}")`);
    try { await img.decode(); } catch (_) { /* paint anyway */ }

    const bands = 24;
    compare.classList.add("is-revealing");
    await tween(2200, (p) => {
      const painted = p >= 1 ? 1 : Math.floor(p * bands) / bands;
      img.style.setProperty("--hide", `${(1 - painted) * 100}%`);
      line.style.setProperty("--y", `${p * 100}%`);
    });
    await sleep(160);
    compare.classList.remove("is-revealing");
    await tween(900, (p) => setSlider(50 * p), easeOut);
  }

  // big files are re-packed in the browser at the same pixel size
  async function packForUpload(file, img) {
    if (file.size <= MAX_BYTES) return file;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    for (const q of [0.95, 0.9, 0.84, 0.76, 0.66]) {
      const b = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
      if (b && b.size <= MAX_BYTES) return b;
    }
    return null;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      toast("That file is not an image. Use PNG, JPG or WEBP.", "err");
      return;
    }
    const url = URL.createObjectURL(file);
    let img;
    try { img = await loadImage(url); } catch (_) {
      URL.revokeObjectURL(url);
      toast("This browser cannot open that image. Save it as PNG or JPG first.", "err");
      return;
    }
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w * h > MAX_PIXELS) {
      URL.revokeObjectURL(url);
      toast(`That image is ${w} x ${h}. Keep it under 24 megapixels.`, "err");
      return;
    }
    const upload = await packForUpload(file, img);
    if (!upload) {
      URL.revokeObjectURL(url);
      toast("That image is too large to upload. Try a smaller file.", "err");
      return;
    }

    if (state.beforeURL) URL.revokeObjectURL(state.beforeURL);
    if (state.afterURL) URL.revokeObjectURL(state.afterURL);
    Object.assign(state, { name: file.name || "image.png", upload, beforeURL: url, afterURL: "", w, h });

    $("#thumb").src = url;
    $("#fileName").textContent = state.name;
    $("#fileInfo").textContent = `${w} x ${h}, ${fmtBytes(file.size)}`;
    $("#fileCard").hidden = false;
    $("#workingImg").src = url;
    stage.dataset.state = "ready";
    outBar.hidden = true;
    paintBtn.disabled = false;
  }

  function clearFile() {
    if (state.beforeURL) URL.revokeObjectURL(state.beforeURL);
    if (state.afterURL) URL.revokeObjectURL(state.afterURL);
    Object.assign(state, { name: "", upload: null, beforeURL: "", afterURL: "", w: 0, h: 0 });
    fileInput.value = "";
    $("#fileCard").hidden = true;
    stage.dataset.state = "empty";
    outBar.hidden = true;
    paintBtn.disabled = true;
  }

  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
  $("#clearFile").addEventListener("click", clearFile);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "dragend", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); loadFile(e.dataTransfer && e.dataTransfer.files[0]); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) { loadFile(f); $("#studio").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); }
  });

  $("#useSample").addEventListener("click", async () => {
    try {
      const blob = await (await fetch("/assets/demo-before.png")).blob();
      form.elements.style.value = "flat";
      await loadFile(new File([blob], "sample.png", { type: "image/png" }));
    } catch (_) {
      toast("Could not load the sample image.", "err");
    }
  });

  const STEPS = ["Finding outlines", "Sealing gaps", "Filling shapes", "Choosing colours", "Spraying paint", "Restoring the ink"];

  async function paint() {
    if (!state.upload || state.busy) return;
    state.busy = true;
    paintBtn.disabled = true;
    $("#repaint").disabled = true;
    outBar.hidden = true;
    stage.dataset.state = "working";

    const label = $("#workingText");
    let step = 0;
    label.textContent = STEPS[0];
    const ticker = setInterval(() => { step = (step + 1) % STEPS.length; label.textContent = STEPS[step]; }, 1100);

    const params = new URLSearchParams({
      seed: String(clampSeed(seed.value)),
      style: form.elements.style.value,
      bg: form.elements.bg.value,
      depth: $("#depth").value,
      saturation: $("#saturation").value,
    });
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 75000);
    const t0 = performance.now();

    try {
      const res = await fetch(`${API}?${params}`, {
        method: "POST",
        headers: { "Content-Type": state.upload.type || "application/octet-stream" },
        body: state.upload,
        signal: ctrl.signal,
      });
      const type = res.headers.get("Content-Type") || "";
      if (!res.ok || !type.startsWith("image/")) {
        let msg = "";
        if (type.includes("application/json")) { try { msg = (await res.json()).error; } catch (_) { /* ignore */ } }
        if (!msg) {
          msg = res.status === 404 || res.status === 405 || type.includes("text/html")
            ? "The painting service is not running. Deploy to Vercel or run python dev_server.py."
            : res.status === 413 ? "That image is too large. Keep uploads under 4.4 MB."
              : `The painting service returned an error (${res.status}). Try again.`;
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      if (state.afterURL) URL.revokeObjectURL(state.afterURL);
      state.afterURL = URL.createObjectURL(blob);

      const beforeImg = $("#beforeImg"), afterImg = $("#afterImg");
      beforeImg.src = state.beforeURL;
      afterImg.src = state.afterURL;
      try { await Promise.all([beforeImg.decode(), afterImg.decode()]); } catch (_) { /* continue */ }

      clearInterval(ticker);
      stage.dataset.state = "done";

      const ext = blob.type === "image/jpeg" ? "jpg" : "png";
      const dl = $("#download");
      dl.href = state.afterURL;
      dl.download = `${state.name.replace(/\.[^.]+$/, "") || "image"}_neon.${ext}`;
      $("#outMeta").textContent = `${state.w} x ${state.h} px in ${secs}s`;

      await paintReveal(state.afterURL, state.beforeURL);
      outBar.hidden = false;
    } catch (err) {
      clearInterval(ticker);
      stage.dataset.state = "ready";
      toast(err.name === "AbortError" ? "Painting took too long. Try a smaller image." : (err.message || "Could not reach the painting service."), "err");
    } finally {
      clearTimeout(timeout);
      state.busy = false;
      paintBtn.disabled = !state.upload;
      $("#repaint").disabled = false;
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); paint(); });
  $("#repaint").addEventListener("click", () => { shuffleSeed(); paint(); });

  /* =============================================================== BOOT */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initHero, { once: true });
  else initHero();
})();
