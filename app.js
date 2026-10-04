const THEMES = {
  chocolate: { cake: "#5b3414", icing: "#f3e6cf", candle: "#c81d3a", label: "Chocolate" },
  strawberry: { cake: "#d45d6c", icing: "#ffe4ec", candle: "#7c3aed", label: "Strawberry" },
  matcha: { cake: "#4f7a4a", icing: "#e8f3d8", candle: "#c2410c", label: "Matcha" },
  blueberry: { cake: "#3d4c8a", icing: "#e4e9ff", candle: "#db2777", label: "Blueberry" },
};

const app = document.getElementById("app");
const canvas = document.getElementById("confetti");
const ctx = canvas.getContext("2d");

let confettiBits = [];
let confettiTimer = 0;
let audio = { stream: null, ctx: null, analyser: null, data: null, raf: 0 };
let blown = false;

function encodeCard(data) {
  const json = JSON.stringify({
    n: data.name.trim(),
    a: Number(data.age),
    m: data.message.trim(),
    t: data.theme,
  });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCard(payload) {
  try {
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const theme = THEMES[data.t] ? data.t : "chocolate";
    const age = Number(data.a);
    if (!data.n || !Number.isFinite(age) || age < 1 || age > 120) return null;
    return { name: String(data.n).slice(0, 40), age, message: String(data.m || "").slice(0, 280), theme };
  } catch {
    return null;
  }
}

function cardUrl(payload) {
  const url = new URL(location.href);
  url.hash = "c/" + payload;
  url.search = "";
  return url.href;
}

function route() {
  stopMic();
  blown = false;
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (hash.startsWith("c/")) {
    const card = decodeCard(hash.slice(2));
    if (!card) {
      renderMissing();
      return;
    }
    renderParty(card);
    return;
  }
  if (hash.startsWith("share/")) {
    const card = decodeCard(hash.slice(6));
    if (!card) {
      renderMissing();
      return;
    }
    renderShare(card, hash.slice(6));
    return;
  }
  renderCreate();
}

function renderCreate(prefill = {}) {
  const theme = prefill.theme || "chocolate";
  app.innerHTML = `
    <section class="layout">
      <div>
        <div class="hero-title" aria-hidden="true">
          <span class="tape tape-a">Create a</span>
          <span class="tape tape-b">birthday</span>
          <span class="tape tape-c">card!</span>
        </div>
        <p class="hero-copy">Enter a name, age, and a hidden message. Share the link — they blow out the candles, then your note appears.</p>
      </div>
      <form class="card" id="create-form">
        <div class="mini-candles" aria-hidden="true"><span class="mini-stick"></span><span class="mini-stick"></span><span class="mini-stick"></span></div>
        <p class="lede">The message stays hidden until the candles go out.</p>
        <label for="name">Name</label>
        <input class="field field-name" id="name" name="name" maxlength="40" required placeholder="Name" value="${escapeAttr(prefill.name || "")}" />
        <label for="age">Age</label>
        <input class="field field-age" id="age" name="age" type="number" min="1" max="120" required placeholder="Age" value="${escapeAttr(prefill.age || "")}" />
        <label for="message">Message</label>
        <textarea class="field field-message" id="message" name="message" maxlength="280" placeholder="A wish that appears after they blow out the candles">${escapeHtml(prefill.message || "")}</textarea>
        <label>Cake flavor</label>
        <div class="themes">
          ${Object.entries(THEMES)
            .map(
              ([key, t]) => `
            <button type="button" class="theme ${key === theme ? "is-on" : ""}" data-theme="${key}">
              <div class="swatch" style="background: linear-gradient(90deg, ${t.cake}, ${t.icing})"></div>
              ${t.label}
            </button>`
            )
            .join("")}
        </div>
        <input type="hidden" name="theme" id="theme" value="${theme}" />
        <p class="error" id="form-error"></p>
        <button class="btn" type="submit">Create</button>
      </form>
    </section>
  `;

  app.querySelectorAll(".theme").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.querySelectorAll(".theme").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      app.querySelector("#theme").value = btn.dataset.theme;
    });
  });

  app.querySelector("#create-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.name.value.trim();
    const age = Number(form.age.value);
    const message = form.message.value.trim();
    const selectedTheme = form.theme.value;
    const err = app.querySelector("#form-error");
    if (!name) {
      err.textContent = "Add a name.";
      return;
    }
    if (!Number.isFinite(age) || age < 1 || age > 120) {
      err.textContent = "Age should be between 1 and 120.";
      return;
    }
    const payload = encodeCard({ name, age, message, theme: selectedTheme });
    location.hash = "share/" + payload;
  });
}

function renderShare(card, payload) {
  const url = cardUrl(payload);
  app.innerHTML = `
    <section class="layout">
      <div>
        <div class="hero-title" aria-hidden="true">
          <span class="tape tape-a">Card</span>
          <span class="tape tape-b">ready</span>
          <span class="tape tape-c">to share</span>
        </div>
        <p class="hero-copy">Send this link. It works forever and does not need an account.</p>
      </div>
      <div class="card">
        <p class="lede">Birthday card for <strong>${escapeHtml(card.name)}</strong>, turning ${card.age}.</p>
        <div class="share-box" id="share-url" tabindex="0" role="button" aria-label="Copy the birthday card link">${escapeHtml(url)}</div>
        <p class="copy-status" id="copy-status" aria-live="polite">Ready to share</p>
        <button class="btn" id="copy-link" type="button">Copy link</button>
        <button class="btn secondary" id="open-card" type="button">Open the card</button>
        <button class="btn ghost" id="edit-card" type="button">Edit details</button>
      </div>
    </section>
  `;

  const shareBox = app.querySelector("#share-url");
  const copyStatus = app.querySelector("#copy-status");
  const copyButton = app.querySelector("#copy-link");

  const selectShareUrl = () => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(shareBox);
    selection.removeAllRanges();
    selection.addRange(range);
    shareBox.focus();
  };

  shareBox.addEventListener("click", selectShareUrl);
  shareBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectShareUrl();
    }
  });

  copyButton.addEventListener("click", async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        selectShareUrl();
        document.execCommand("copy");
      }
      copyStatus.textContent = "Link copied.";
      copyButton.textContent = "Copied!";
      setTimeout(() => {
        copyButton.textContent = "Copy link";
        copyStatus.textContent = "Ready to share";
      }, 1600);
    } catch {
      selectShareUrl();
      copyStatus.textContent = "Copy failed — select the link and copy it manually.";
      copyButton.textContent = "Copy from the box above";
    }
  });
  app.querySelector("#open-card").addEventListener("click", () => {
    location.hash = "c/" + payload;
  });
  app.querySelector("#edit-card").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname + location.search);
    renderCreate(card);
  });
}

function candleCount(age) {
  if (age <= 18) return age;
  if (age <= 40) return 12;
  return 9;
}

function applyTheme(themeKey) {
  const t = THEMES[themeKey] || THEMES.chocolate;
  document.documentElement.style.setProperty("--theme-cake", t.cake);
  document.documentElement.style.setProperty("--theme-icing", t.icing);
  document.documentElement.style.setProperty("--theme-candle", t.candle);
}

function renderParty(card) {
  applyTheme(card.theme);
  const n = candleCount(card.age);
  const candles = Array.from({ length: n }, (_, i) => {
    const hue = [0, 40, 190, 280, 130][i % 5];
    return `<div class="candle" style="background: hsl(${hue} 70% 48%)"><span class="wick"></span><span class="flame"></span></div>`;
  }).join("");

  app.innerHTML = `
    <section class="party">
      <h1>Happy birthday, ${escapeHtml(card.name)}!</h1>
      <p class="hint">Make a wish, then blow into your mic — or tap the cake.</p>
      <p class="mic" id="mic-status">Listening for a blow…</p>
      <div class="stage" id="cake-stage" role="button" tabindex="0" aria-label="Tap to blow out the candles">
        <div class="cake">
          <div class="plate"></div>
          <div class="layer bottom"></div>
          <div class="layer middle"></div>
          <div class="layer top"></div>
          <div class="icing"></div>
          <div class="drip a"></div>
          <div class="drip b"></div>
          <div class="drip c"></div>
          <div class="candles">${candles}</div>
        </div>
      </div>
      <p class="message-reveal" id="wish">${card.message ? escapeHtml(card.message) : "Hope your day is as sweet as this cake."}</p>
      <div class="actions">
        <button class="btn" id="blow-btn" type="button">Blow candles</button>
        <button class="btn secondary" id="replay" type="button" hidden>Light them again</button>
      </div>
    </section>
  `;

  const blow = () => blowOut(card);
  app.querySelector("#cake-stage").addEventListener("click", blow);
  app.querySelector("#cake-stage").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      blow();
    }
  });
  app.querySelector("#blow-btn").addEventListener("click", blow);
  app.querySelector("#replay").addEventListener("click", () => {
    blown = false;
    stopConfetti();
    app.querySelectorAll(".flame").forEach((f) => f.classList.remove("out"));
    app.querySelector("#wish").classList.remove("show");
    app.querySelector("#blow-btn").hidden = false;
    app.querySelector("#replay").hidden = true;
    app.querySelector("#mic-status").textContent = "Listening for a blow…";
    startMic();
  });
  startMic();
}

function renderMissing() {
  app.innerHTML = `
    <section class="missing card" style="max-width:420px;margin:0 auto">
      <h1>This card link is invalid</h1>
      <p class="lede">The payload in the URL could not be read. Create a new one instead.</p>
      <button class="btn" id="home" type="button">Create a card</button>
    </section>
  `;
  app.querySelector("#home").addEventListener("click", () => {
    location.hash = "";
  });
}

function blowOut() {
  if (blown) return;
  blown = true;
  stopMic();
  app.querySelectorAll(".flame").forEach((f) => f.classList.add("out"));
  app.querySelector("#wish").classList.add("show");
  app.querySelector("#mic-status").textContent = "Wish granted.";
  const blowBtn = app.querySelector("#blow-btn");
  const replay = app.querySelector("#replay");
  if (blowBtn) blowBtn.hidden = true;
  if (replay) replay.hidden = false;
  burstConfetti();
}

async function startMic() {
  const status = app.querySelector("#mic-status");
  if (!navigator.mediaDevices?.getUserMedia) {
    if (status) status.textContent = "Mic not available — tap the cake instead.";
    return;
  }
  try {
    audio.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audio.ctx.createMediaStreamSource(audio.stream);
    audio.analyser = audio.ctx.createAnalyser();
    audio.analyser.fftSize = 512;
    source.connect(audio.analyser);
    audio.data = new Uint8Array(audio.analyser.fftSize);
    if (status) status.textContent = "Mic on — blow toward your device.";
    listenBlow();
  } catch {
    if (status) status.textContent = "Mic blocked — tap the cake or use Blow candles.";
  }
}

function listenBlow() {
  let loudFrames = 0;
  const loop = () => {
    if (!audio.analyser || blown) return;
    audio.analyser.getByteTimeDomainData(audio.data);
    let sum = 0;
    for (let i = 0; i < audio.data.length; i++) {
      const v = (audio.data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / audio.data.length);
    if (rms > 0.12) loudFrames += 1;
    else loudFrames = Math.max(0, loudFrames - 1);
    if (loudFrames > 6) {
      blowOut();
      return;
    }
    audio.raf = requestAnimationFrame(loop);
  };
  audio.raf = requestAnimationFrame(loop);
}

function stopMic() {
  cancelAnimationFrame(audio.raf);
  if (audio.stream) audio.stream.getTracks().forEach((t) => t.stop());
  if (audio.ctx) audio.ctx.close().catch(() => {});
  audio = { stream: null, ctx: null, analyser: null, data: null, raf: 0 };
}

function burstConfetti() {
  resizeCanvas();
  const colors = ["#8b5cf6", "#ef7a7a", "#e8c15a", "#7eb8ea", "#8fd3c0", "#fff"];
  confettiBits = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 80,
    r: 3 + Math.random() * 5,
    c: colors[(Math.random() * colors.length) | 0],
    vy: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    a: Math.random() * Math.PI,
  }));
  confettiTimer = 180;
  tickConfetti();
}

function tickConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiBits.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.a += 0.1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
    ctx.restore();
  });
  confettiTimer -= 1;
  if (confettiTimer > 0) requestAnimationFrame(tickConfetti);
  else ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function stopConfetti() {
  confettiTimer = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resizeCanvas() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}

window.addEventListener("hashchange", route);
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
route();
