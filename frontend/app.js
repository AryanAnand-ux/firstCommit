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

function toast(msg, isErr) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ---------------- config guard ---------------- */
if (!cfg) {
  document.getElementById("app").innerHTML =
    '<div class="empty"><div class="big">! </div><p><b>config.js missing.</b><br>Run <code>deploy.ps1</code> to generate config.js from the stack outputs.</p></div>';
}

/* ---------------- auth (Cognito) ---------------- */
const Auth = {
  _pool: cfg ? new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: cfg.POOL_ID, ClientId: cfg.CLIENT_ID }) : null,
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
    const err = new Error(data.message || ("Request failed (" + res.status + ")"));
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
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === location.hash));
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
    ${r.note ? `<p class="muted" style="margin-top:8px">${esc(r.note)}</p>` : ""}
    <div class="row">
      <span class="muted">📞 ${esc(r.requester_phone)}</span>
      <a class="btn sec" style="margin-left:auto;padding:8px 14px;margin-right:8px" target="_blank" href="https://wa.me/${esc(r.requester_phone.replace(/[^0-9]/g, ""))}?text=${encodeURIComponent("Hi, I can help with your blood request for " + r.blood_type + " in " + r.city + ".")}">WhatsApp</a>
    </div>
  </div>`;
}

/* ---------------- views ---------------- */
const Views = {
  home() {
    const app = $("#app");
    app.innerHTML = `
      <section class="hero">
        <span class="eyebrow">Live now · India</span>
        <h1>The right donor, minutes away — <span class="accent">not a WhatsApp chain</span>.</h1>
        <p>RaktaSetu matches verified, eligible donors in your city to urgent blood &amp; platelet requests — and alerts them by SMS in seconds.</p>
        <div class="hero-cta">
          <button class="btn" data-goto="#/requests">Need blood now</button>
          <button class="btn sec" data-goto="#/donor">Become a donor</button>
          <button class="btn sec" data-goto="#/assistant">Ask the assistant</button>
        </div>
      </section>
      <div class="stats" id="statRow"><div class="empty">Loading live stats…</div></div>
      <h2 class="sec-title">How it works</h2>
      <p class="sec-sub">Three steps, one emergency.</p>
      <div class="steps">
        <div class="step"><span class="k">1</span><h4>Post a request</h4><p>Blood type, city, hospital, urgency. Takes 30 seconds.</p></div>
        <div class="step"><span class="k">2</span><h4>We match &amp; alert</h4><p>Eligible donors of your type in your city get an SMS + in-app alert instantly.</p></div>
        <div class="step"><span class="k">3</span><h4>Donor confirms</h4><p>You get their contact the moment they confirm. Track everything.</p></div>
      </div>
      <h2 class="sec-title">Open requests</h2>
      <p class="sec-sub">Live needs across India.</p>
      <div id="homeRequests"><div class="empty">Loading…</div></div>
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
            <input id="cphone" required placeholder="+919876543210" autocomplete="off" />
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

      <h2 class="sec-title" style="font-size:18px">Live feed</h2>
      <div class="chips" id="reqChips"></div>
      <div id="reqList"><div class="empty">Loading…</div></div>
    `;
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
          <input id="dphone" required placeholder="+919876543210" autocomplete="off" />
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
          <label class="toggle"><input id="davail" type="checkbox" checked /> Available to donate now</label>
        </div>
        <div class="field full">
          <button class="btn block" id="dbtn" data-label="Save profile">Save profile</button>
        </div>
      </form>
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
      <div class="chat" id="chatBox"></div>
      <form class="chat-input" data-action="askAssistant">
        <input id="msg" placeholder="Ask Rakta…" autocomplete="off" />
        <button class="btn" id="askBtn" data-label="Send">Send</button>
      </form>
    `;
    addBubble("bot", "Hi, I'm Rakta. I can answer donor-eligibility questions and post requests for you. What's the situation?");
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
        <div class="field full"><label class="toggle"><input id="aisDonor" type="checkbox" checked /> I want to donate blood</label></div>
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
async function loadStats() {
  const row = $("#statRow");
  if (!row || !cfg) return;
  try {
    const s = await api("/stats");
    row.innerHTML = `
      <div class="stat"><div class="num">${esc(s.requests.open)}</div><div class="lbl"><span class="live-dot"></span> Open</div></div>
      <div class="stat"><div class="num">${esc(s.requests.total)}</div><div class="lbl">Total posted</div></div>
      <div class="stat"><div class="num">${esc(s.requests.fulfilled)}</div><div class="lbl">Fulfilled</div></div>
      <div class="stat"><div class="num">${esc(s.donors_total)}</div><div class="lbl">Donors ready</div></div>`;
  } catch (e) {
    row.innerHTML = '<div class="empty">Stats unavailable. Deploy to see live numbers.</div>';
  }
}

async function loadHomeRequests() {
  const el = $("#homeRequests");
  if (!el) return;
  try {
    const d = await api("/requests?status=open&limit=6");
    el.innerHTML = d.requests.length
      ? d.requests.map(requesterCard).join("")
      : '<div class="empty"><p>No open requests right now. Be the first.</p></div>';
  } catch (e) {
    el.innerHTML = '<div class="empty">Could not load requests.</div>';
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

async function loadRequests(status) {
  const el = $("#reqList");
  el.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const d = await api("/requests?status=" + status + "&limit=50");
    el.innerHTML = d.requests.length
      ? d.requests.map(requesterCard).join("")
      : '<div class="empty"><p>Nothing here.</p></div>';
  } catch (e) {
    el.innerHTML = '<div class="empty">Could not load. ' + esc(e.message) + "</div>";
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
      ? d.matches.map((m) => {
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
              <span class="muted">📞 ${esc(m.requester_phone)}</span>
              ${pending
                ? `<span style="margin-left:auto;display:flex;gap:8px">
                     <button class="btn ok" data-confirm="${esc(m.match_id)}" data-label="Confirm">Confirm</button>
                     <button class="btn sec" data-decline="${esc(m.match_id)}" data-label="Decline">Decline</button>
                   </span>`
                : ""}
            </div>
          </div>`;
        }).join("")
      : '<div class="empty"><p>No alert yet. Register as a donor and you\'ll be matched when someone in your city needs your blood type.</p></div>';

    $$("#alertList [data-confirm]").forEach((b) =>
      b.addEventListener("click", () => respondAlert(b.dataset.confirm, "confirm", b))
    );
    $$("#alertList [data-decline]").forEach((b) =>
      b.addEventListener("click", () => respondAlert(b.dataset.decline, "decline", b))
    );
  } catch (e) {
    el.innerHTML = '<div class="empty">Could not load alerts: ' + esc(e.message) + "</div>";
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
    name: Auth.email.split("@")[0],
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

function route() {
  const h = location.hash || "#/";
  if (!cfg && h !== "#/") { location.hash = "#/"; return; }
  const view = (Views[h.split("?")[0]] ? h.split("?")[0] : "#/");
  Views[view]();
  updateAuthUI();
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
}

window.addEventListener("hashchange", route);

/* ---------------- boot ---------------- */
updateAuthUI();
route();