/* RaktaSetu SPA — vanilla JS, Cognito auth, SAM API Gateway. */

const cfg = window.RAKTA_CONFIG || null;

/* ---------------- helpers ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const ICON_DROP =
  '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M38 6c10 14 18 23 18 37a20 20 0 1 1-40 0c0-14 8-23 18-37Z" fill="currentColor" fill-opacity=".92"/><path d="M32 20c3.4 6 6.7 10 6.7 15a6.7 6.7 0 1 1-13.4 0c0-5 3.3-9 6.7-15Z" fill="var(--paper-2)"/></svg>';

const ICON_PHONE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

const ICON_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function dropState(title, subtitle) {
  return `<div class="empty"><div class="icon">${ICON_DROP}</div>${esc(title)}${subtitle ? `<p>${subtitle}</p>` : ""}</div>`;
}

function telPill(phone) {
  const safe = phone || "";
  return `<span class="tel-pill">${ICON_PHONE}${esc(safe) || "No phone on file"}</span>`;
}

function waLink(phone, text) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return `<a class="btn sec" style="margin-left:auto;margin-right:8px" target="_blank" rel="noopener" href="https://wa.me/${digits}?text=${encodeURIComponent(text)}">WhatsApp</a>`;
}

function toast(msg, isErr) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3400);
}

/* ---------------- config guard ---------------- */
if (!cfg) {
  document.getElementById("app").innerHTML =
    '<div class="empty"><div class="icon">' + ICON_DROP + '</div>config.js missing.<p>Run <code>deploy.ps1</code> to generate config.js from the stack outputs.</p></div>';
}

/* ---------------- auth (Cognito) ---------------- */
function makePool(cfg) {
  try {
    if (cfg && cfg.POOL_ID && cfg.CLIENT_ID) {
      return new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: cfg.POOL_ID, ClientId: cfg.CLIENT_ID });
    }
  } catch (e) { /* bad/absent pool must never crash the SPA */ }
  return null;
}

const Auth = {
  _pool: makePool(cfg),
  email: localStorage.getItem("rakta_user") || "",

  _user() {
    if (!this._pool || !this.email) return null;
    return new AmazonCognitoIdentity.CognitoUser({
      Username: this.email,
      Pool: this._pool,
      authenticationFlowType: "USER_PASSWORD_AUTH",
    });
  },

  getToken() {
    return new Promise((resolve, reject) => {
      if (!this._pool || !this.email) return reject(new Error("not signed in"));
      const u = this._user();
      u.getSession((err, session) => {
        if (err || !session.isValid()) return reject(new Error("session expired"));
        resolve(session.getIdToken().getJwtToken());
      });
    });
  },

  signUp(email, password, isDonor) {
    return new Promise((resolve, reject) => {
      const attrs = [new AmazonCognitoIdentity.CognitoUserAttribute({ Name: "custom:isDonor", Value: isDonor ? "1" : "0" })];
      this._pool.signUp(email, password, attrs, null, (err) => (err ? reject(err) : resolve()));
    });
  },

  confirm(email, code) {
    return new Promise((resolve, reject) => {
      const u = new AmazonCognitoIdentity.CognitoUser({ Username: email, Pool: this._pool });
      u.confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
    });
  },

  signIn(email, password) {
    return new Promise((resolve, reject) => {
      this.email = email;
      const u = this._user();
      const d = new AmazonCognitoIdentity.AuthenticationDetails({ Username: email, Password: password });
      u.authenticateUser(d, { onSuccess: () => resolve(), onFailure: (e) => reject(e) });
    });
  },

  signOut() {
    const u = this._user();
    if (u) u.signOut();
    localStorage.removeItem("rakta_user");
    this.email = "";
    updateAuthUI();
    route();
  },

  setEmail(e) {
    this.email = e;
    localStorage.setItem("rakta_user", e);
    updateAuthUI();
  },
};

/* ---------------- api client ---------------- */
async function api(path, opts = {}) {
  let token = null;
  try { token = await Auth.getToken(); } catch (e) { /* public calls fine */ }
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(cfg.API_BASE + path, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const friendly =
      res.status === 429
        ? "You are sending requests too fast. Wait a moment and try again."
        : res.status === 409 || res.status === 400 || res.status === 403
        ? data.message
        : data.message || ("Request failed (" + res.status + ")");
    const err = new Error(friendly);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- auth ui ---------------- */
function updateAuthUI() {
  const btn = $("#authBtn");
  const chip = $("#userChip");
  if (Auth.email) {
    btn.textContent = "Sign out";
    btn.className = "auth-pill ghost";
    chip.textContent = Auth.email.split("@")[0];
  } else {
    btn.textContent = "Sign in";
    btn.className = "auth-pill";
    chip.textContent = "";
  }
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === (currentRoute || "#/")));
}

$("body").addEventListener("click", (e) => {
  if (e.target.id === "authBtn") {
    if (Auth.email) Auth.signOut();
    else location.hash = "#/auth";
  }
  const nav = e.target.closest("[data-nav]");
  if (nav) location.hash = nav.dataset.nav;
});

$("body").addEventListener("submit", async (e) => {
  const f = e.target.closest("form[data-action]");
  if (!f) return;
  e.preventDefault();
  const fn = ACTIONS[f.dataset.action];
  if (fn) await fn(f);
});

const ACTIONS = {};

/* ---------------- toast + spinner ---------------- */
function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spinner"></span>' : btn.dataset.label || btn.textContent;
}

async function requireAuth() {
  try { await Auth.getToken(); return true; }
  catch (e) { toast("Please sign in first"); location.hash = "#/auth"; return false; }
}

/* ---------------- sign-in prompt ---------------- */
function signInCard(title, sub) {
  return `
  <div class="signin-card">
    ${ICON_DROP}
    <div>
      <h3>${esc(title || "Sign in to see live requests")}</h3>
      <p>${esc(sub || "Public stats & blood-need matrix are open to everyone above. In-depth feeds are for signed-in users.")}</p>
    </div>
    <a class="btn" href="#/auth">Sign in</a>
  </div>`;
}

/* ---------------- render helpers ---------------- */
function requesterCard(r) {
  const badgeCls = ["fulfilled", "cancelled", "expired"].includes(r.status) ? r.status : (r.urgency === "urgent" ? "urgent" : "planned");
  const badgeLabel = r.status === "open" ? (r.urgency === "urgent" ? "Urgent" : "Planned") : r.status.charAt(0).toUpperCase() + r.status.slice(1);
  return `
  <div class="card ${r.urgency === "urgent" && r.status === "open" ? "urgent" : "planned"}">
    <div class="card-top">
      <span class="bt-chip">${esc(r.blood_type)}</span>
      <span class="badge ${badgeCls}">${esc(badgeLabel)}</span>
      <span class="badge ${r.status === "open" ? "sent" : "expired"}">${esc(r.units)} unit(s)</span>
    </div>
    <h3>${esc(r.hospital || r.city + " · " + r.blood_type)}</h3>
    <div class="meta">${esc(r.city)} · by ${esc(r.requester_name)} · ends ${esc((r.expires_at || "").replace("T", " "))}</div>
    ${r.confirmed_count > 0 || r.declined_count > 0 ? `<div class="meta confirmed-line" role="status" aria-live="polite"><b>${esc(r.confirmed_count)}</b> donor${r.confirmed_count === 1 ? "" : "s"} confirmed${r.declined_count > 0 ? ` · ${esc(r.declined_count)} declined` : ""}</div>` : ""}
    ${r.note ? `<p class="muted" style="margin-top:8px">${esc(r.note)}</p>` : ""}
    <div class="row">
      ${telPill(r.requester_phone)}
      ${waLink(r.requester_phone, "Hi, I can help with your blood request for " + r.blood_type + " in " + r.city + ".")}
    </div>
  </div>`;
}

/* ---------------- views ---------------- */
const Views = {
  home() {
    const app = $("#app");
    app.innerHTML = `
      <section class="hero">
        <span class="eyebrow"><span class="live-dot"></span> Live across India · response in minutes</span>
        <h1>The right donor — <span class="accent">a bridge away</span>, not a WhatsApp chain.</h1>
        <p class="lede">RaktaSetu pairs verified, eligible donors in your city with urgent blood &amp; platelet requests, and alerts them by SMS in seconds.</p>
        <div class="hero-cta">
          <button class="btn" data-goto="#/requests">${ICON_PLUS}Need blood now</button>
          <button class="btn sec" data-goto="#/donor">Become a donor</button>
          <button class="btn sec" data-goto="#/assistant">Ask the assistant</button>
        </div>
        <p class="hero-note">Free for hospitals, patients and donors. Built for First Commit 2026.</p>
      </section>

      <div class="stats" id="statRow"><div class="empty">Loading live stats…</div></div>

      <section class="card gap-card" aria-labelledby="gapTitle">
        <div class="gap-head">
          <h2 class="sec-title" id="gapTitle" style="font-size:23px">Where help is needed</h2>
          <div class="gap-legend">
            <span><i class="legend-don"></i>Donors</span>
            <span><i class="legend-need"></i>Open needs</span>
          </div>
        </div>
        <p>Live supply vs demand across the eight major blood groups. Demand outruns supply in most cities — every registered donor counts.</p>
        <div id="gapMatrix"><div class="empty">Loading blood-need matrix…</div></div>
      </section>

      <section class="section-gap">
        <h2 class="sec-title">How it works</h2>
        <p class="sec-sub">Three steps, one emergency — no group chats required.</p>
        <div class="steps">
          <div class="step"><span class="k">1</span><h4>Post a request</h4><p>Blood type, city, hospital, urgency. Takes 30 seconds.</p></div>
          <div class="step"><span class="k">2</span><h4>We match &amp; alert</h4><p>Eligible donors of your type in your city get an SMS plus an in-app alert instantly.</p></div>
          <div class="step"><span class="k">3</span><h4>Donor confirms</h4><p>You get their contact the moment they confirm, and track everything from one place.</p></div>
        </div>
      </section>

      <section class="section-gap">
        <h2 class="sec-title">Live requests</h2>
        <p class="sec-sub">Open needs across India, newest first.</p>
        <div id="homeRequests"><div class="empty">Loading…</div></div>
      </section>
    `;
    loadStats();
    loadHomeRequests();
  },

  requests() {
    if (!cfg) return;
    const app = $("#app");
    app.innerHTML = `
      <h1 class="sec-title" style="margin-top:8px">Requests</h1>
      <p class="sec-sub">Browse live needs or post a new one.</p>

      <div class="card" id="createCard">
        <h3>Post a request</h3>
        <p class="muted" style="margin:4px 0 14px" id="createHint">One of your own, your family's, or someone at your hospital.</p>
        <form data-action="createRequest" class="form-grid">
          <div class="field">
            <label for="cbt">Blood type *</label>
            <select id="cbt" required>${BLOOD.map((b) => `<option>${b}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label for="ccity">City *</label>
            <input id="ccity" required placeholder="e.g. Pune" autocomplete="off" />
          </div>
          <div class="field">
            <label for="chospital">Hospital</label>
            <input id="chospital" placeholder="Optional" autocomplete="off" />
          </div>
          <div class="field">
            <label for="cunits">Units</label>
            <input id="cunits" type="number" min="1" max="4" value="1" />
          </div>
          <div class="field">
            <label for="curgency">Urgency</label>
            <select id="curgency"><option value="urgent">Urgent (24h)</option><option value="planned" selected>Planned (72h)</option></select>
          </div>
          <div class="field">
            <label for="cphone">Contact phone * (E.164)</label>
            <input id="cphone" required type="tel" inputmode="tel" autocomplete="tel" placeholder="+919876543210" pattern="[+0-9]{10,15}" />
          </div>
          <div class="field full">
            <label for="cnote">Note to donors</label>
            <textarea id="cnote" rows="2" placeholder="e.g. Patient scheduled for surgery Thursday"></textarea>
          </div>
          <div class="field full">
            <button class="btn block" id="cbtn" data-label="Post & alert donors">Post &amp; alert donors</button>
          </div>
        </form>
      </div>

      <h2 class="sec-title" style="font-size:18px" id="myReqTitle"></h2>
      <div id="myReqList"></div>

      <h2 class="sec-title" style="font-size:18px">Live feed</h2>
      <div class="chips" id="reqChips"></div>
      <div id="reqList"><div class="empty">Loading…</div></div>
    `;
    loadMyRequests();
    renderStatusChips();
    loadRequests("open");
  },

  donor() {
    const app = $("#app");
    app.innerHTML = `
      <h1 class="sec-title" style="margin-top:8px">Donor profile</h1>
      <p class="sec-sub">Registered donors are matched &amp; SMS-alerted when someone needs your blood type in your city.</p>
      <form data-action="saveDonor" class="card form-grid">
        <div class="field">
          <label for="dname">Full name *</label>
          <input id="dname" required placeholder="As on your ID" autocomplete="off" />
        </div>
        <div class="field">
          <label for="dphone">Phone * (E.164)</label>
          <input id="dphone" required type="tel" inputmode="tel" autocomplete="tel" placeholder="+919876543210" pattern="[+0-9]{10,15}" />
        </div>
        <div class="field">
          <label for="dbt">Blood type *</label>
          <select id="dbt" required>${BLOOD.map((b) => `<option>${b}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label for="dcity">City *</label>
          <input id="dcity" required placeholder="e.g. Bengaluru" autocomplete="off" />
        </div>
        <div class="field">
          <label for="dlast">Last donation date</label>
          <input id="dlast" type="date" />
        </div>
        <div class="field" style="justify-content:flex-end">
          <label class="toggle"><input id="davail" type="checkbox" checked /><span class="track"></span> Available to donate now</label>
        </div>
        <div class="field full">
          <button class="btn block" id="dbtn" data-label="Save profile">Save profile</button>
        </div>
      </form>

      <div class="card facts">
        <h3>Know before you donate</h3>
        <ul class="clean">
          <li><strong>Eligibility:</strong> you must be 18–65, weigh at least 50&nbsp;kg, and be in good health on the day.</li>
          <li><strong>Intervals:</strong> wait 3 months between whole-blood donations in India; platelets can be given more often (2–4 weeks) after medical clearance.</li>
          <li><strong>Not eligible today:</strong> fever, active cold/flu, on antibiotics, low haemoglobin, recent tattoo/piercing (last 6 months), or pregnant.</li>
          <li><strong>Before:</strong> hydrate well, eat a light meal 2–3 hours prior, avoid alcohol 24h before, sleep 8 hours.</li>
          <li><strong>After:</strong> rest 10–15 min, eat something sweet, avoid heavy lifting for a few hours, drink extra fluids.</li>
          <li><strong>You save lives:</strong> one donation ~350&nbsp;ml can help up to 3 patients — and only ~1% of India&apos;s eligible population donates. Be the 1%.</li>
        </ul>
        <p class="muted" style="margin-top:12px;font-size:13px">Not medical advice. Eligibility is verified at the blood bank before every donation.</p>
      </div>
    `;
    if (Auth.email) loadDonorProfile();
  },

  alerts() {
    const app = $("#app");
    app.innerHTML = `
      <h1 class="sec-title" style="margin-top:8px">My alerts</h1>
      <p class="sec-sub">Requests where you are a matched donor. Confirm and the requester gets your contact instantly.</p>
      <div id="alertList"><div class="empty">Loading…</div></div>
    `;
    loadAlerts();
  },

  assistant() {
    const app = $("#app");
    app.innerHTML = `
      <h1 class="sec-title" style="margin-top:8px">Assistant</h1>
      <p class="sec-sub">Ask about donating, or just tell it: <em>“I need B+ plasma in Nagpur”</em>.</p>
      <div class="chat" id="chatBox" aria-live="polite"></div>
      <div class="chips assistant-chips" id="assistantChips">
        <button class="chip" type="button">Can I donate?</button>
        <button class="chip" type="button">I need B+ in Nagpur</button>
        <button class="chip" type="button">What are my requests?</button>
      </div>
      <form class="chat-input" data-action="askAssistant">
        <input id="msg" placeholder="Ask Rakta…" autocomplete="off" />
        <button class="btn" id="askBtn" data-label="Send">Send</button>
      </form>
    `;
    addBubble("bot", "Hi, I'm Rakta. I can answer donor-eligibility questions and post requests for you. What's the situation?");
    $("#assistantChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      $("#msg").value = b.textContent;
      $('form[data-action="askAssistant"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    $("#msg").focus();
  },

  auth() {
    const app = $("#app");
    app.innerHTML = `
      <div class="auth-box">
        <h1 class="sec-title" style="margin-top:8px">Account</h1>
        <p class="sec-sub">Sign in to post requests or register as a donor.</p>
        <div class="tabs">
          <button class="tab active" data-tab="signin">Sign in</button>
          <button class="tab" data-tab="signup">Sign up</button>
        </div>
        <div id="authPane">
          <form data-action="signIn" class="card form-grid">
            <div class="field full"><label for="aemail">Email</label><input id="aemail" type="email" required autocomplete="email" /></div>
            <div class="field full"><label for="apass">Password</label><input id="apass" type="password" required autocomplete="current-password" /></div>
            <div class="field full"><button class="btn block" id="aBtn" data-label="Sign in">Sign in</button></div>
          </form>
        </div>
      </div>
    `;
    $$(".tab").forEach((t) => t.addEventListener("click", () => authTab(t.dataset.tab)));
  },
};

function authTab(tab) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  const p = $("#authPane");
  if (tab === "signin") {
    p.innerHTML = `
      <form data-action="signIn" class="card form-grid">
        <div class="field full"><label>Email</label><input id="aemail" type="email" required autocomplete="email" /></div>
        <div class="field full"><label>Password</label><input id="apass" type="password" required autocomplete="current-password" /></div>
        <div class="field full"><button class="btn block" id="aBtn" data-label="Sign in">Sign in</button></div>
      </form>`;
  } else if (tab === "signup") {
    p.innerHTML = `
      <form data-action="signUp" class="card form-grid">
        <div class="field full"><label>Email</label><input id="aemail" type="email" required autocomplete="email" /></div>
        <div class="field full"><label>Password (8+, upper, lower, number)</label><input id="apass" type="password" required autocomplete="new-password" /></div>
        <div class="field full"><label class="toggle"><input id="aisDonor" type="checkbox" checked /><span class="track"></span> I want to donate blood</label></div>
        <div class="field full"><button class="btn block" id="aBtn" data-label="Create account">Create account</button></div>
      </form>`;
  } else if (tab === "confirm") {
    p.innerHTML = `
      <form data-action="confirmSignUp" class="card form-grid">
        <div class="field full"><label>Email</label><input id="aemail" type="email" required value="${esc(Auth.email)}" /></div>
        <div class="field full"><label>Confirmation code (check inbox)</label><input id="acode" required autocomplete="one-time-code" /></div>
        <div class="field full"><button class="btn block" id="aBtn" data-label="Confirm">Confirm</button></div>
      </form>`;
  }
}

/* ---------------- data loading ---------------- */
function countUp(el, target, dur = 900) {
  if (!el) return;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) { el.textContent = target; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function loadStats() {
  const row = $("#statRow");
  if (!row || !cfg) return;
  row.setAttribute("aria-busy", "true");
  try {
    const s = await api("/stats");
    const stats = [
      { v: s.requests.open, lbl: "Open needs", live: true, role: "status" },
      { v: s.requests.total, lbl: "Total posted", live: false, role: "status" },
      { v: s.requests.fulfilled, lbl: "Fulfilled", live: false, role: "status" },
      { v: s.donors_ready, lbl: "Donors ready", live: false, role: "status" },
    ];
row.setAttribute("aria-busy", "false");
    row.innerHTML = stats.map((st) =>
      `<div class="stat"><div class="num" data-count="${esc(st.v)}">0</div><div class="lbl">${st.live ? '<span class="live-dot"></span>' : ""}${esc(st.lbl)}${st.live ? ' <span style="font-size:10px;opacity:0.6">(live)</span>' : ""}</div></div>`
    ).join("");
    $$("#statRow .num").forEach((el) => countUp(el, parseInt(el.dataset.count, 10) || 0));
    renderGapMatrix(s);
  } catch (e) {
    row.setAttribute("aria-busy", "false");
    row.innerHTML = '<div class="empty">Stats unavailable — deploy to see live numbers.</div>';
    const gm = $("#gapMatrix");
    if (gm) gm.innerHTML = dropState("Blood-need matrix unavailable", "It appears once the backend is deployed.");
  }
}

function gapState(don, need) {
  if (don === 0 && need === 0) return { label: "No data", cls: "full" };
  if (need === 0) return { label: "Donors ready", cls: "ok" };
  if (don === 0) return { label: "Needs donors", cls: "needy" };
  if (don >= need) return { label: "Covered", cls: "ok" };
  return { label: "Needs donors", cls: "needy" };
}

function renderGapMatrix(s) {
  const el = $("#gapMatrix");
  if (!el) return;
  const don = s.donors_by_blood_type || {};
  const need = s.requests_open_by_blood_type || {};
  const donMax = Math.max(1, ...Object.values(don));
  const needMax = Math.max(1, ...Object.values(need));
  const rows = BLOOD.map((bt, i) => {
    const d = don[bt] || 0;
    const n = need[bt] || 0;
    const st = gapState(d, n);
    return `
    <div class="gap-row" style="animation-delay:${(i * 0.03).toFixed(2)}s">
      <span class="gap-type">${bt}</span>
      <div><div class="gap-bar"><div class="fill don" style="width:${d ? Math.max(3, (d / donMax) * 100) : 0}%"></div></div><div class="gap-label">${d} donor${d === 1 ? "" : "s"}</div></div>
      <div><div class="gap-bar"><div class="fill need" style="width:${n ? Math.max(3, (n / needMax) * 100) : 0}%"></div></div><div class="gap-label">${n} open need${n === 1 ? "" : "s"}</div></div>
      <span class="gap-state ${st.cls}">${st.label}</span>
    </div>`;
  }).join("");
  el.innerHTML = rows;
}

async function loadHomeRequests() {
  const el = $("#homeRequests");
  if (!el) return;
  if (!Auth.email) {
    el.innerHTML = signInCard();
    return;
  }
  try {
    const d = await api("/requests?status=open&limit=6");
    el.innerHTML = d.requests.length
      ? `<div class="feed-grid">${d.requests.map(requesterCard).join("")}</div>`
      : dropState("No open requests right now", "Be the first to post one — it takes 30 seconds.");
  } catch (e) {
    el.innerHTML = dropState("Could not load requests", esc(e.message));
  }
}

function renderStatusChips() {
  const el = $("#reqChips");
  ["open", "fulfilled", "expired"].forEach((s) => {
    const b = document.createElement("button");
    b.className = "chip" + (s === "open" ? " active" : "");
    b.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    b.addEventListener("click", () => {
      $$("#reqChips .chip").forEach((c) => c.classList.remove("active"));
      b.classList.add("active");
      loadRequests(s);
    });
    el.appendChild(b);
  });
}

async function loadMyRequests() {
  const title = $("#myReqTitle");
  const el = $("#myReqList");
  if (!el) return;
  if (!Auth.email) {
    title.textContent = "";
    el.innerHTML = dropState("Sign in to manage your requests", '<a href="#/auth">Sign in</a> to post and track your own requests.');
    return;
  }
  try {
    const d = await api("/requests/mine");
    title.textContent = "My requests";
    el.innerHTML = d.requests.length
      ? `<div class="feed-grid">${d.requests.map((r) => myRequestCard(r)).join("")}</div>`
      : dropState("You have not posted any requests yet", "Need blood in your city? Post one above.");
    $$("#myReqList [data-update]").forEach((b) =>
      b.addEventListener("click", () => updateMyRequest(b.dataset.id, b.dataset.update, b))
    );
  } catch (e) {
    title.textContent = "";
    el.innerHTML = dropState("Could not load your requests", esc(e.message));
  }
}

function myRequestCard(r) {
  const canAct = r.status === "open";
  return `
  <div class="card ${r.urgency === "urgent" ? "urgent" : "planned"}">
    <div class="card-top">
      <span class="bt-chip">${esc(r.blood_type)}</span>
      <span class="badge ${r.status === "open" ? "sent" : r.status}">${esc(r.status)}</span>
      <span class="badge ${r.urgency === "urgent" ? "urgent" : "planned"}">${esc(r.urgency)}</span>
      <span class="meta">expires ${esc((r.expires_at || "").replace("T", " "))}</span>
    </div>
    <div class="meta">${esc(r.hospital || r.city)} · ${esc(r.city)} · ${esc(r.units)} unit(s)</div>
    ${r.confirmed_count > 0 ? `<div class="meta confirmed-line" role="status" aria-live="polite"><b>${esc(r.confirmed_count)}</b> donor${r.confirmed_count === 1 ? "" : "s"} confirmed${r.declined_count > 0 ? ` · ${esc(r.declined_count)} declined` : ""}</div>` : ""}
    ${r.note ? `<p class="muted" style="margin-top:6px">${esc(r.note)}</p>` : ""}
    ${canAct ? `<div class="row"><span class="muted">Donors are being alerted. Keep this live until someone confirms.</span>
      <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn sec btn-badge" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("Need " + r.blood_type + " in " + r.city + ". Help spread the word — " + location.origin + location.pathname + "#/requests")}">Share</a>
        <button class="btn ok btn-badge" data-update="fulfill" data-id="${esc(r.request_id)}" data-label="Mark fulfilled">Mark fulfilled</button>
        <button class="btn sec btn-badge" data-update="cancel" data-id="${esc(r.request_id)}" data-label="Cancel request">Cancel</button>
      </span></div>` : ""}
  </div>`;
}

async function updateMyRequest(id, action, btn) {
  busy(btn, true);
  try {
    const r = await api("/requests/" + id, { method: "PATCH", body: JSON.stringify({ action }) });
    toast("Request " + r.status + ". Donors have been notified.");
    loadMyRequests();
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
}

async function loadRequests(status) {
  const el = $("#reqList");
  if (!el || !cfg) return;
  if (!Auth.email) {
    el.innerHTML = signInCard("Sign in to browse live needs", "Posting, matching and donor alerts require a free account. The blood-need matrix on the home page is public.");
    if ($("#reqChips")) $("#reqChips").innerHTML = "";
    return;
  }
  el.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const d = await api("/requests?status=" + status + "&limit=50");
    el.innerHTML = d.requests.length
      ? `<div class="feed-grid">${d.requests.map(requesterCard).join("")}</div>`
      : dropState("Nothing here", 'Try another tab above, or <a href="#/requests">post a request</a>.');
  } catch (e) {
    el.innerHTML = dropState("Could not load requests", esc(e.message));
  }
}

async function loadDonorProfile() {
  try {
    const d = await api("/donors/me");
    const f = $("#dname");
    if (!f) return;
    if (d.name) $("#dname").value = d.name;
    if (d.phone) $("#dphone").value = d.phone;
    if (d.blood_type) $("#dbt").value = d.blood_type;
    if (d.city) $("#dcity").value = d.city;
    if (d.last_donation) $("#dlast").value = d.last_donation.slice(0, 10);
    const av = $("#davail");
    if (av && typeof d.available === "boolean") av.checked = d.available;
  } catch (e) {}
}

async function loadAlerts() {
  const el = $("#alertList");
  if (!(await requireAuth())) return;
  try {
    const d = await api("/matches/me");
    el.innerHTML = d.matches.length
      ? `<div class="feed-grid">${d.matches.map((m) => {
          const pending = m.status === "sent";
          return `
          <div class="card ${m.urgency === "urgent" ? "urgent" : "planned"}">
            <div class="card-top">
              <span class="bt-chip">${esc(m.request_blood_type)}</span>
              <span class="badge ${pending ? "sent" : m.status}">${esc(m.status)}</span>
              <span class="badge ${m.urgency === "urgent" ? "urgent" : "planned"}">${esc(m.urgency)}</span>
            </div>
            <h3>${esc(m.request_hospital || m.request_city)}</h3>
            <div class="meta">${esc(m.request_city)} · ${esc(m.request_note || "")} · asked by ${esc(m.requester_name)}</div>
            <div class="row">
              ${telPill(m.requester_phone)}
              ${pending
                ? `<span style="margin-left:auto;display:flex;gap:8px">
                     <button class="btn ok btn-badge" data-confirm="${esc(m.match_id)}" data-label="Confirm">Confirm</button>
                     <button class="btn sec btn-badge" data-decline="${esc(m.match_id)}" data-label="Decline">Decline</button>
                   </span>`
                : ""}
            </div>
          </div>`;
        }).join("")}</div>`
      : dropState("No alerts yet", "Register as a donor and you'll be matched when someone in your city needs your blood type.");
    $$("#alertList [data-confirm]").forEach((b) =>
      b.addEventListener("click", () => respondAlert(b.dataset.confirm, "confirm", b))
    );
    $$("#alertList [data-decline]").forEach((b) =>
      b.addEventListener("click", () => respondAlert(b.dataset.decline, "decline", b))
    );
  } catch (e) {
    el.innerHTML = dropState("Could not load alerts", esc(e.message));
  }
}

async function respondAlert(id, action, btn) {
  busy(btn, true);
  try {
    await api("/matches/" + id + "/respond", { method: "POST", body: JSON.stringify({ action }) });
    toast(action === "confirm" ? "Confirmed — requester has been notified." : "Declined.");
    loadAlerts();
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
}

function addBubble(role, text) {
  const box = $("#chatBox");
  const d = document.createElement("div");
  d.className = "bubble " + (role === "me" ? "me" : "bot");
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

/* ---------------- actions ---------------- */
ACTIONS.createRequest = async (form) => {
  if (!(await requireAuth())) return;
  const body = {
    blood_type: $("#cbt").value,
    city: $("#ccity").value.trim(),
    hospital: $("#chospital").value.trim(),
    units: parseInt($("#cunits").value || "1", 10),
    urgency: $("#curgency").value,
    phone: $("#cphone").value.trim(),
    note: $("#cnote").value.trim(),
  };
  const btn = $("#cbtn");
  busy(btn, true);
  try {
    const r = await api("/requests", { method: "POST", body: JSON.stringify(body) });
    toast(`Posted! ${r.matches} matching donor(s) alerted (${r.sms_alerted} reached by SMS).`);
    form.reset();
    loadRequests("open");
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
};

ACTIONS.saveDonor = async (form) => {
  if (!(await requireAuth())) return;
  const body = {
    name: $("#dname").value.trim(),
    phone: $("#dphone").value.trim(),
    blood_type: $("#dbt").value,
    city: $("#dcity").value.trim(),
    last_donation: $("#dlast").value || "",
    available: $("#davail").checked,
  };
  const btn = $("#dbtn");
  busy(btn, true);
  try {
    const r = await api("/donors/me", { method: "PUT", body: JSON.stringify(body) });
    toast(r.donation_eligible ? "Saved — you're matchable now." : "Saved — you're on cooldown till your next eligible date.");
    busy(btn, false);
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
};

ACTIONS.askAssistant = async (form) => {
  if (!(await requireAuth())) return;
  const msg = $("#msg").value.trim();
  if (!msg) return;
  form.reset();
  addBubble("me", msg);
  const typing = document.createElement("div");
  typing.className = "typing bot";
  typing.innerHTML = "<span></span><span></span><span></span>";
  $("#chatBox").appendChild(typing);
  $("#askBtn").disabled = true;
  try {
    const r = await api("/assistant", { method: "POST", body: JSON.stringify({ message: msg }) });
    typing.remove();
    addBubble("bot", r.reply);
  } catch (e) {
    typing.remove();
    addBubble("bot", "Sorry — " + e.message);
  } finally {
    $("#askBtn").disabled = false;
  }
};

ACTIONS.signUp = async (form) => {
  const email = $("#aemail").value.trim();
  const pass = $("#apass").value;
  const isDonor = ($("#aisDonor") || {}).checked === true;
  const btn = $("#aBtn");
  busy(btn, true);
  try {
    await Auth.signUp(email, pass, isDonor);
    Auth.setEmail(email);
    toast("Check your inbox for a confirmation code.");
    authTab("confirm");
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
};

ACTIONS.confirmSignUp = async (form) => {
  const email = $("#aemail").value.trim();
  const code = $("#acode").value.trim();
  const btn = $("#aBtn");
  busy(btn, true);
  try {
    await Auth.confirm(email, code);
    Auth.setEmail(email);
    toast("Confirmed. Now sign in.");
    authTab("signin");
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
};

ACTIONS.signIn = async (form) => {
  const email = $("#aemail").value.trim();
  const pass = $("#apass").value;
  const btn = $("#aBtn");
  busy(btn, true);
  try {
    await Auth.signIn(email, pass);
    Auth.setEmail(email);
    toast("Welcome back!");
    location.hash = "#/";
  } catch (e) {
    busy(btn, false);
    toast("Sign-in failed: " + e.message, true);
  }
};

/* ---------------- router ---------------- */
document.body.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) location.hash = g.dataset.goto;
});

const ROUTES = { "#/": "home", "#/requests": "requests", "#/donor": "donor", "#/alerts": "alerts", "#/assistant": "assistant", "#/auth": "auth" };
let currentRoute = "#/";

function route() {
  const h = location.hash || "#/";
  if (!cfg && h !== "#/") { location.hash = "#/"; return; }
  const key = h.split("?")[0] || "#/";
  const view = ROUTES[key] || "home";
  currentRoute = key;
  Views[view]();
  updateAuthUI();
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);

/* ---------------- boot ---------------- */
updateAuthUI();
route();