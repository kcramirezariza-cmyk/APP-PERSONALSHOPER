/* ============================================================
   ARMADIUSA · Envíos USA → Colombia
   Lógica de la aplicación (Firebase compat + modo prueba local)
   ============================================================ */

/* ---------- Usuarios y roles (cambia usuario/clave aquí) ---------- */
const USERS = {
  admin:  { pass: "110826",     role: "admin",    nombre: "Administrador" },
  armadi: { pass: "armadi2026", role: "colombia", nombre: "Colaboradora Colombia" },
};

/* ---------- Flujo de estados ---------- */
const STATUSES = [
  { key: "por_comprar",  label: "Por comprar",  color: "#a1a1aa" },
  { key: "por_empacar",  label: "Por empacar",  color: "#8b8b93" },
  { key: "por_enviar",   label: "Por enviar",   color: "#71717a" },
  { key: "enviado",      label: "Despachado",   color: "#5c5c64" },
  { key: "recibido_col", label: "Recibido Col", color: "#46464d" },
  { key: "enviado_col",  label: "Enviado Col",  color: "#2f2f35" },
  { key: "entregado",    label: "Entregado",    color: "#18181b" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));
const statusIndex = k => STATUSES.findIndex(s => s.key === k);
const statusLabel = k => (STATUS_MAP[k] ? STATUS_MAP[k].label : k);
const statusColor = k => (STATUS_MAP[k] ? STATUS_MAP[k].color : "#8b95b0");

/* El colaborador en Colombia solo ve desde "Enviado (a Col)" en adelante */
const COLOMBIA_START = "enviado";

/* ---------- Departamentos de Colombia ---------- */
const DEPARTAMENTOS = [
  "Amazonas","Antioquia","Arauca","Atlántico","Bogotá D.C.","Bolívar","Boyacá",
  "Caldas","Caquetá","Casanare","Cauca","Cesar","Chocó","Córdoba","Cundinamarca",
  "Guainía","Guaviare","Huila","La Guajira","Magdalena","Meta","Nariño",
  "Norte de Santander","Putumayo","Quindío","Risaralda","San Andrés y Providencia",
  "Santander","Sucre","Tolima","Valle del Cauca","Vaupés","Vichada",
];

/* ---------- Utilidades de formato ---------- */
const COP = n => "$" + (Number(n) || 0).toLocaleString("es-CO");
const onlyDigits = s => (s || "").toString().replace(/\D/g, "");
const parseNum = s => Number(onlyDigits(s)) || 0;
const fmtThousands = s => { const d = onlyDigits(s); return d ? Number(d).toLocaleString("es-CO") : ""; };
const tsMillis = ts => {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  if (typeof ts === "number") return ts;
  const d = new Date(ts); return isNaN(d) ? 0 : d.getTime();
};
const fmtDate = ts => {
  const m = tsMillis(ts); if (!m) return "";
  const d = new Date(m);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) +
         " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};
const fmtDay = ts => {
  const m = tsMillis(ts); if (!m) return "Sin fecha";
  return new Date(m).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
};
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const escapeHtml = s => (s == null ? "" : String(s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

/* ---------- Abonos ---------- */
function getAbonos(o) {
  if (Array.isArray(o.abonos)) return o.abonos;
  if (o.abono) return [{ monto: o.abono, fecha: o.createdAt || Date.now() }];
  return [];
}
const abonoTotal = o => getAbonos(o).reduce((a, x) => a + (Number(x.monto) || 0), 0);
const saldoDe = o => (o.valor || 0) - abonoTotal(o);

/* ---------- ¿Está archivado (entregado en un día anterior)? ---------- */
function isArchived(o) {
  if (o.status !== "entregado") return false;
  const t = tsMillis(o.historial && o.historial.entregado);
  return t > 0 && t < startOfToday();
}

/* ---------- Estado global ---------- */
let db, auth;
let ORDERS = [];
let CLIENTS = [];
let editingOrderId = null;
let unsubOrders = null, unsubClients = null;
let listenersStarted = false;
let FIREBASE_READY = false;
let CURRENT = { user: null, role: "admin" };

/* ============================================================
   INICIALIZACIÓN DE FIREBASE
   ============================================================ */
function initFirebase() {
  const cfg = window.__FIREBASE_CONFIG__;
  if (!cfg || cfg.apiKey === "PEGA_AQUI_TU_API_KEY") {
    document.getElementById("loginError").textContent =
      "⚠ Sin Firebase configurado: puedes ver la interfaz, pero los datos aún no se guardan.";
    return false;
  }
  if (typeof firebase === "undefined") {
    document.getElementById("loginError").textContent =
      "⚠ No cargaron las librerías (¿sin internet?). Revisa tu conexión.";
    return false;
  }
  firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.firestore();
  return true;
}

/* ============================================================
   AUTENTICACIÓN Y ROLES
   ============================================================ */
function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userEmail").textContent =
    (USERS[CURRENT.user] ? USERS[CURRENT.user].nombre : CURRENT.user) + " · " + CURRENT.user;
  applyRole();
  if (!listenersStarted) {
    if (FIREBASE_READY) startListeners();
    else startLocal();
    listenersStarted = true;
  }
}
function showLogin() {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

// Muestra/oculta pestañas y botones según el rol.
function applyRole() {
  const isAdmin = CURRENT.role === "admin";
  document.querySelectorAll("[data-role='admin']").forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });
}

function offlineNote(msg) {
  const stats = document.getElementById("statsRow");
  if (stats) stats.innerHTML = "";
  const board = document.getElementById("board");
  if (board) board.innerHTML =
    `<div style="padding:18px 20px;color:var(--amber);background:var(--card);
      border:1px solid var(--line);border-radius:12px;max-width:640px;line-height:1.5">
      ⚠ ${escapeHtml(msg)}</div>`;
}

function wireLogin() {
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const user = document.getElementById("loginEmail").value.trim().toLowerCase();
    const pass = document.getElementById("loginPassword").value;
    const err = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");
    err.textContent = "";

    const u = USERS[user];
    if (!u || u.pass !== pass) {
      err.textContent = "Usuario o clave incorrectos.";
      return;
    }
    CURRENT = { user, role: u.role };

    localStorage.setItem("armadiusa_ok", "1");
    localStorage.setItem("armadiusa_user", user);
    btn.disabled = true; btn.textContent = "Ingresando…";
    try {
      if (FIREBASE_READY && auth && !auth.currentUser) await auth.signInAnonymously();
      showApp();
    } catch (ex) {
      const code = ex.code || ex.message || "";
      showApp();
      offlineNote(code.includes("operation-not-allowed")
        ? "Activa 'Anónimo' en Firebase → Authentication → Sign-in method para guardar datos."
        : "Sin conexión con Firebase (" + code + "). La interfaz funciona, pero los datos no se guardarán hasta resolverlo.");
    } finally {
      btn.disabled = false; btn.textContent = "Ingresar";
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("armadiusa_ok");
    showLogin();
  });
}

function restoreSession() {
  auth.onAuthStateChanged(() => {
    if (localStorage.getItem("armadiusa_ok") === "1") {
      const user = localStorage.getItem("armadiusa_user");
      if (USERS[user]) { CURRENT = { user, role: USERS[user].role }; showApp(); }
    }
  });
}

/* ============================================================
   LISTENERS EN TIEMPO REAL (Firestore)
   ============================================================ */
function startListeners() {
  unsubOrders = db.collection("ordenes").orderBy("createdAt", "desc")
    .onSnapshot(snap => {
      ORDERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }, err => console.error("Órdenes:", err));

  unsubClients = db.collection("clientes").orderBy("numero")
    .onSnapshot(snap => {
      CLIENTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderClientDatalist();
      renderClientsTable();
    }, err => console.error("Clientes:", err));
}

function renderAll() {
  renderBoard(); renderStats();
  renderHistorial(); renderDashboard();
}

/* ============================================================
   MODO DE PRUEBA (sin Firebase) — datos en este navegador
   ============================================================ */
function lsGet(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
  catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function saveLocal() { lsSet("armadiusa_orders", ORDERS); lsSet("armadiusa_clients", CLIENTS); }
function renderAllLocal() {
  renderAll(); renderClientDatalist(); renderClientsTable();
}
function newLocalId() { return "loc_" + Date.now() + "_" + Math.random().toString(36).slice(2); }

function startLocal() {
  localBanner("Modo de prueba: los datos se guardan solo en este navegador. Configura Firebase para producción y sincronizar EE.UU.↔Colombia.");
  ORDERS = lsGet("armadiusa_orders", []);
  CLIENTS = lsGet("armadiusa_clients", []);
  renderAllLocal();
}

function localBanner(msg) {
  if (document.getElementById("localBanner")) return;
  const b = document.createElement("div");
  b.id = "localBanner";
  b.style.cssText = "background:var(--panel);border-bottom:1px solid var(--line);" +
    "color:var(--muted);font-size:12.5px;padding:8px 22px;text-align:center;letter-spacing:.01em";
  b.textContent = "🧪 " + msg;
  document.querySelector(".topbar").insertAdjacentElement("afterend", b);
}

// Convierte la foto a un dato incrustado (se guarda en el registro, sin Storage).
async function fileToDataURL(file) {
  const blob = await compressImage(file, 760, 0.55);
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(blob);
  });
}

/* ============================================================
   NÚMERO DE CLIENTE
   ============================================================ */
function nextClientNumber() {
  const max = CLIENTS.reduce((m, c) => Math.max(m, Number(c.numero) || 0), 0);
  return max + 1;
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function setupNav() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });
}
function showView(view) {
  // Bloquea vistas restringidas para el colaborador
  if (CURRENT.role !== "admin" && (view === "nueva" || view === "dashboard")) view = "tablero";
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById("view-" + view).classList.remove("hidden");
  if (view === "nueva" && !editingOrderId) resetOrderForm();
}

/* ============================================================
   TABLERO (KANBAN)
   ============================================================ */
function visibleStatuses() {
  if (CURRENT.role === "admin") return STATUSES;
  const start = statusIndex(COLOMBIA_START);
  return STATUSES.slice(start);
}

function getFilteredOrders() {
  const q = document.getElementById("searchOrders").value.toLowerCase().trim();
  const st = document.getElementById("filterStatus").value;
  return ORDERS.filter(o => {
    if (isArchived(o)) return false;            // los archivados van al Historial
    if (st && o.status !== st) return false;
    if (!q) return true;
    const c = o.cliente || {};
    const hay = [o.productName, c.nombre, "#" + c.numero, c.ciudad, c.departamento,
      o.guia, o.guiaUsa, c.telefono].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// En Despachado y Recibido Col se agrupan las órdenes que comparten guía de
// EE.UU. (van en la misma caja). En el resto de columnas se listan sueltas.
function colBodyHTML(list, statusKey) {
  if (statusKey === "enviado" || statusKey === "recibido_col") {
    const groups = {}; const solos = [];
    list.forEach(o => { if (o.guiaUsa) (groups[o.guiaUsa] = groups[o.guiaUsa] || []).push(o); else solos.push(o); });
    let html = Object.keys(groups).map(g => `
      <div class="box-group">
        <div class="box-group-head">📦 Caja ${escapeHtml(g)} <span>${groups[g].length}</span></div>
        ${groups[g].map(cardHTML).join("")}
      </div>`).join("");
    html += solos.map(cardHTML).join("");
    return html || `<div class="col-empty">—</div>`;
  }
  return list.map(cardHTML).join("") || `<div class="col-empty">—</div>`;
}

function renderBoard() {
  const board = document.getElementById("board");
  const cols = visibleStatuses();
  const orders = getFilteredOrders();
  board.innerHTML = cols.map(s => {
    const list = orders.filter(o => o.status === s.key);
    return `
      <div class="col">
        <div class="col-head">
          <span class="title"><span class="dot" style="background:${s.color}"></span>${s.label}</span>
          <span class="count">${list.length}</span>
        </div>
        <div class="col-body">
          ${colBodyHTML(list, s.key)}
        </div>
      </div>`;
  }).join("");

  board.querySelectorAll(".card").forEach(el =>
    el.addEventListener("click", () => openOrderModal(el.dataset.id)));
}

function cardHTML(o) {
  const saldo = saldoDe(o);
  const paid = saldo <= 0;
  const c = o.cliente || {};
  const thumb = o.fotoURL
    ? `<img class="thumb" src="${o.fotoURL}" alt="" loading="lazy" />`
    : `<div class="thumb"></div>`;
  return `
    <div class="card" data-id="${o.id}">
      <div class="row1">
        ${thumb}
        <div>
          <div class="pname">${escapeHtml(o.productName)}</div>
          <div class="cname">${c.numero ? "#" + c.numero + " · " : ""}${escapeHtml(c.nombre || "—")}</div>
        </div>
      </div>
      <div class="meta">
        <span class="city">${escapeHtml(c.ciudad || "")}</span>
        <span class="saldo-tag ${paid ? "paid" : "pend"}">
          ${paid ? "Pagado ✓" : "Debe " + COP(saldo)}
        </span>
      </div>
      ${o.guiaUsa ? `<div class="guia">📦 EE.UU.: ${escapeHtml(o.guiaUsa)}</div>` : ""}
      ${o.guia ? `<div class="guia">Guía: ${escapeHtml(o.guia)}</div>`
        : (o.tipoEnvio === "domicilio" ? `<div class="guia">Domicilio</div>` : "")}
    </div>`;
}

function renderStats() {
  const activos = ORDERS.filter(o => o.status !== "entregado");
  const porCobrar = ORDERS.reduce((a, o) => a + Math.max(0, saldoDe(o)), 0);
  const recaudado = ORDERS.reduce((a, o) => a + abonoTotal(o), 0);
  document.getElementById("statsRow").innerHTML = `
    <div class="stat"><div class="num">${ORDERS.length}</div><div class="lbl">Órdenes totales</div></div>
    <div class="stat"><div class="num">${activos.length}</div><div class="lbl">En proceso</div></div>
    <div class="stat money"><div class="num">${COP(porCobrar)}</div><div class="lbl">Saldo por cobrar</div></div>
    <div class="stat money"><div class="num">${COP(recaudado)}</div><div class="lbl">Total recaudado</div></div>`;
}

function setupFilters() {
  const sel = document.getElementById("filterStatus");
  STATUSES.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.key; opt.textContent = s.label;
    sel.appendChild(opt);
  });
  document.getElementById("searchOrders").addEventListener("input", renderBoard);
  sel.addEventListener("change", renderBoard);
}

/* ============================================================
   MODAL DE DETALLE + AVANCE + ABONOS
   ============================================================ */
function openOrderModal(id) {
  const o = ORDERS.find(x => x.id === id);
  if (!o) return;
  const saldo = saldoDe(o);
  const idx = statusIndex(o.status);
  const isAdmin = CURRENT.role === "admin";

  const timeline = STATUSES.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    const when = o.historial && o.historial[s.key];
    return `<div class="tl-step ${cls}">
      <span class="tl-dot"></span>
      <span class="tl-label">${s.label}</span>
      <span class="tl-date">${when ? fmtDate(when) : ""}</span>
    </div>`;
  }).join("");

  const c = o.cliente || {};
  const nextStatus = STATUSES[idx + 1];

  // Listado de abonos
  const abonos = getAbonos(o);
  const abonosHTML = abonos.length
    ? abonos.map((a, i) => `<div class="detail-row"><span class="k">Abono ${i + 1} · ${fmtDate(a.fecha)}</span><span>${COP(a.monto)}</span></div>`).join("")
    : `<div class="detail-row"><span class="k">Sin abonos aún</span><span></span></div>`;

  const abonoAddUI = saldo > 0 ? `
    <div class="guia-input-row" style="margin-top:8px">
      <input type="text" inputmode="numeric" id="nuevoAbono" placeholder="Registrar nuevo abono (COP)" />
      <button class="btn-primary" id="addAbonoBtn">Abonar</button>
    </div>` : "";

  // Avance de estado
  let advanceUI = "";
  if (o.status === "entregado") {
    advanceUI = `<span class="badge done">✓ Proceso completo</span>`;
  } else if (o.status === "por_enviar") {
    // Paso a "Despachado": guía de la transportadora de EE.UU. (BoxExpress), opcional
    const guides = [...new Set(ORDERS.map(x => x.guiaUsa).filter(Boolean))];
    advanceUI = `
      <div style="width:100%">
        <div class="detail-section-title">Guía transportadora EE.UU. (BoxExpress)</div>
        <div class="guia-input-row">
          <input type="text" id="guiaUsaInput" list="guiaUsaList" placeholder="N° de guía BoxExpress (opcional)" value="${escapeHtml(o.guiaUsa || "")}" />
          <button class="btn-primary" id="advanceBtn">Marcar Despachado →</button>
        </div>
        <datalist id="guiaUsaList">${guides.map(g => `<option value="${escapeHtml(g)}"></option>`).join("")}</datalist>
        <span class="file-note">Si varios productos van en la misma caja, usa el mismo número: se agruparán juntos.</span>
      </div>`;
  } else if (o.status === "recibido_col") {
    // Paso a "Enviado Col": elegir tipo de envío; guía opcional
    advanceUI = `
      <div style="width:100%">
        <div class="detail-section-title">Envío en Colombia</div>
        <div class="radio-row">
          <label class="radio"><input type="radio" name="tipoEnvio" value="interrapidisimo" checked /> Interrapidísimo</label>
          <label class="radio"><input type="radio" name="tipoEnvio" value="domicilio" /> Domicilio</label>
        </div>
        <div class="guia-input-row" style="margin-top:8px">
          <input type="text" id="guiaInput" placeholder="N° de guía (opcional)" value="${escapeHtml(o.guia || "")}" />
          <button class="btn-primary" id="advanceBtn">Marcar Enviado Col →</button>
        </div>
      </div>`;
  } else {
    advanceUI = `<button class="btn-primary" id="advanceBtn">Avanzar a: ${nextStatus.label} →</button>`;
  }

  const envioInfo = o.tipoEnvio
    ? `<div class="detail-row"><span class="k">Tipo de envío</span><span>${o.tipoEnvio === "domicilio" ? "Domicilio" : "Interrapidísimo"}</span></div>`
    : "";

  document.getElementById("orderModalBody").innerHTML = `
    ${o.fotoURL ? `<img class="detail-photo" src="${o.fotoURL}" alt="Producto" />` : ""}
    <h2 style="margin:0 0 6px">${escapeHtml(o.productName)}</h2>
    <span class="badge">${statusLabel(o.status)}</span>

    <div class="detail-section-title">Pago</div>
    <div class="detail-row"><span class="k">Valor del producto</span><span>${COP(o.valor)}</span></div>
    ${abonosHTML}
    <div class="detail-row"><span class="k">Total abonado</span><span>${COP(abonoTotal(o))}</span></div>
    <div class="detail-row"><span class="k">Saldo pendiente</span>
      <span style="color:${saldo > 0 ? "var(--amber)" : "var(--green)"};font-weight:700">
        ${saldo > 0 ? COP(saldo) : "Pagado ✓"}</span></div>
    ${abonoAddUI}

    <div class="detail-section-title">Cliente</div>
    <div class="detail-row"><span class="k">N° de cliente</span><span>${c.numero ? "#" + c.numero : "—"}</span></div>
    <div class="detail-row"><span class="k">Nombre</span><span>${escapeHtml(c.nombre)}</span></div>
    <div class="detail-row"><span class="k">Teléfono</span><span>${escapeHtml(c.telefono)}</span></div>
    ${c.red ? `<div class="detail-row"><span class="k">Red social</span><span>${escapeHtml(c.red)}</span></div>` : ""}
    <div class="detail-row"><span class="k">Dirección</span><span>${escapeHtml(c.direccion)}</span></div>
    <div class="detail-row"><span class="k">Barrio</span><span>${escapeHtml(c.barrio)}</span></div>
    ${c.referencia ? `<div class="detail-row"><span class="k">Referencia</span><span>${escapeHtml(c.referencia)}</span></div>` : ""}
    <div class="detail-row"><span class="k">Ciudad</span><span>${escapeHtml(c.ciudad)}</span></div>
    <div class="detail-row"><span class="k">Departamento</span><span>${escapeHtml(c.departamento || c.municipio || "")}</span></div>
    ${o.guiaUsa ? `<div class="detail-row"><span class="k">Guía EE.UU. (BoxExpress)</span><span>${escapeHtml(o.guiaUsa)}</span></div>` : ""}
    ${envioInfo}
    ${o.guia ? `<div class="detail-row"><span class="k">Guía Colombia</span><span>${escapeHtml(o.guia)}</span></div>` : ""}

    <div class="detail-section-title">Recorrido</div>
    <div class="timeline">${timeline}</div>

    <div class="modal-actions">
      ${advanceUI}
      ${isAdmin ? `<button class="btn-secondary" id="editOrderBtn">✎ Editar</button>` : ""}
      ${isAdmin ? `<button class="btn-ghost" id="deleteOrderBtn" style="color:var(--red);border-color:var(--red)">Eliminar</button>` : ""}
    </div>`;

  document.getElementById("orderModal").classList.remove("hidden");

  const advBtn = document.getElementById("advanceBtn");
  if (advBtn) advBtn.addEventListener("click", () => advanceStatus(o));
  const addAb = document.getElementById("addAbonoBtn");
  if (addAb) addAb.addEventListener("click", () => addAbono(o.id));
  const nuevoAb = document.getElementById("nuevoAbono");
  if (nuevoAb) nuevoAb.addEventListener("input", e => { e.target.value = fmtThousands(e.target.value); });
  const editB = document.getElementById("editOrderBtn");
  if (editB) editB.addEventListener("click", () => { closeModal(); editOrder(o.id); });
  const delB = document.getElementById("deleteOrderBtn");
  if (delB) delB.addEventListener("click", () => deleteOrder(o.id));
}

function closeModal() { document.getElementById("orderModal").classList.add("hidden"); }

async function addAbono(id) {
  const o = ORDERS.find(x => x.id === id);
  if (!o) return;
  const monto = parseNum(document.getElementById("nuevoAbono").value);
  if (!monto) { alert("Escribe el valor del abono."); return; }
  const abonos = getAbonos(o).slice();
  abonos.push({ monto, fecha: Date.now() });
  const total = abonos.reduce((a, x) => a + (Number(x.monto) || 0), 0);

  if (!FIREBASE_READY) {
    const i = ORDERS.findIndex(x => x.id === id);
    ORDERS[i].abonos = abonos; ORDERS[i].abono = total; ORDERS[i].updatedAt = Date.now();
    saveLocal(); renderAllLocal(); openOrderModal(id);
    return;
  }
  try {
    await db.collection("ordenes").doc(id).update({
      abonos, abono: total, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    setTimeout(() => openOrderModal(id), 250);
  } catch (e) { alert("No se pudo registrar el abono: " + e.message); }
}

async function advanceStatus(o) {
  const idx = statusIndex(o.status);
  const next = STATUSES[idx + 1];
  if (!next) return;

  let guia = null, tipoEnvio = null, guiaUsa = null;
  if (next.key === "enviado") {
    guiaUsa = (document.getElementById("guiaUsaInput")?.value || "").trim();  // opcional
  }
  if (next.key === "enviado_col") {
    const t = document.querySelector("input[name='tipoEnvio']:checked");
    tipoEnvio = t ? t.value : "interrapidisimo";
    guia = (document.getElementById("guiaInput")?.value || "").trim();  // opcional
  }

  if (!FIREBASE_READY) {
    const i = ORDERS.findIndex(x => x.id === o.id);
    if (i >= 0) {
      ORDERS[i].status = next.key;
      ORDERS[i].updatedAt = Date.now();
      ORDERS[i].historial = { ...(ORDERS[i].historial || {}), [next.key]: Date.now() };
      if (guiaUsa) ORDERS[i].guiaUsa = guiaUsa;
      if (tipoEnvio) ORDERS[i].tipoEnvio = tipoEnvio;
      if (guia) { ORDERS[i].guia = guia; ORDERS[i].rastreoActivo = tipoEnvio === "interrapidisimo"; }
    }
    saveLocal(); renderAllLocal(); closeModal();
    return;
  }

  const update = {
    status: next.key,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    [`historial.${next.key}`]: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (guiaUsa) update.guiaUsa = guiaUsa;
  if (tipoEnvio) update.tipoEnvio = tipoEnvio;
  if (guia) { update.guia = guia; update.rastreoActivo = tipoEnvio === "interrapidisimo"; }

  try {
    await db.collection("ordenes").doc(o.id).update(update);
    closeModal();
  } catch (e) { alert("No se pudo actualizar: " + e.message); }
}

async function deleteOrder(id) {
  if (!confirm("¿Eliminar esta orden? Esta acción no se puede deshacer.")) return;
  if (!FIREBASE_READY) {
    ORDERS = ORDERS.filter(o => o.id !== id);
    saveLocal(); renderAllLocal(); closeModal();
    return;
  }
  try {
    await db.collection("ordenes").doc(id).delete();
    closeModal();
  } catch (e) { alert("No se pudo eliminar: " + e.message); }
}

/* ============================================================
   FORMULARIO DE NUEVA / EDITAR ORDEN
   ============================================================ */
function setupOrderForm() {
  // Poblar departamentos
  const dep = document.getElementById("cDepartamento");
  dep.innerHTML = `<option value="">Selecciona…</option>` +
    DEPARTAMENTOS.map(d => `<option value="${d}">${d}</option>`).join("");

  const valEl = document.getElementById("productValue");
  const abEl = document.getElementById("abono");
  const saldoEl = document.getElementById("saldoView");
  const recalc = () => {
    valEl.value = fmtThousands(valEl.value);
    abEl.value = fmtThousands(abEl.value);
    const saldo = parseNum(valEl.value) - parseNum(abEl.value);
    saldoEl.value = COP(Math.max(0, saldo)) + (saldo < 0 ? " (a favor)" : "");
  };
  valEl.addEventListener("input", recalc);
  abEl.addEventListener("input", recalc);

  document.getElementById("productPhoto").addEventListener("change", e => {
    const file = e.target.files[0];
    const wrap = document.getElementById("photoPreviewWrap");
    if (!file) { wrap.classList.add("hidden"); return; }
    document.getElementById("photoPreview").src = URL.createObjectURL(file);
    wrap.classList.remove("hidden");
  });

  document.getElementById("clientSearch").addEventListener("change", e => {
    const cli = CLIENTS.find(c => c.nombre === e.target.value);
    if (cli) fillClient(cli);
  });

  document.getElementById("cancelOrderBtn").addEventListener("click", () => {
    resetOrderForm(); showView("tablero");
  });
  document.getElementById("orderForm").addEventListener("submit", saveOrder);
}

function fillClient(c) {
  document.getElementById("cNombre").value = c.nombre || "";
  document.getElementById("cTelefono").value = c.telefono || "";
  document.getElementById("cRed").value = c.red || "";
  document.getElementById("cDireccion").value = c.direccion || "";
  document.getElementById("cBarrio").value = c.barrio || "";
  document.getElementById("cReferencia").value = c.referencia || "";
  document.getElementById("cCiudad").value = c.ciudad || "";
  document.getElementById("cDepartamento").value = c.departamento || c.municipio || "";
}

function readClientForm() {
  return {
    nombre: document.getElementById("cNombre").value.trim(),
    telefono: document.getElementById("cTelefono").value.trim(),
    red: document.getElementById("cRed").value.trim(),
    direccion: document.getElementById("cDireccion").value.trim(),
    barrio: document.getElementById("cBarrio").value.trim(),
    referencia: document.getElementById("cReferencia").value.trim(),
    ciudad: document.getElementById("cCiudad").value.trim(),
    departamento: document.getElementById("cDepartamento").value,
  };
}

function resetOrderForm() {
  editingOrderId = null;
  document.getElementById("orderForm").reset();
  document.getElementById("orderFormTitle").textContent = "Nueva orden";
  document.getElementById("saveOrderBtn").textContent = "Guardar orden";
  document.getElementById("photoPreviewWrap").classList.add("hidden");
  document.getElementById("orderFormMsg").textContent = "";
  document.getElementById("saldoView").value = "";
}

function editOrder(id) {
  const o = ORDERS.find(x => x.id === id);
  if (!o) return;
  editingOrderId = id;
  showView("nueva");
  document.getElementById("orderFormTitle").textContent = "Editar orden";
  document.getElementById("saveOrderBtn").textContent = "Guardar cambios";
  document.getElementById("productName").value = o.productName || "";
  document.getElementById("productValue").value = fmtThousands(String(o.valor || ""));
  // El abono inicial no se re-edita aquí (se maneja con "Abonar" en el detalle)
  document.getElementById("abono").value = "";
  document.getElementById("abono").placeholder = "Abono inicial ya registrado";
  const saldo = saldoDe(o);
  document.getElementById("saldoView").value = COP(Math.max(0, saldo));
  fillClient(o.cliente || {});
  if (o.fotoURL) {
    document.getElementById("photoPreview").src = o.fotoURL;
    document.getElementById("photoPreviewWrap").classList.remove("hidden");
  }
}

function compressImage(file, maxW = 1200, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo procesar la imagen")),
        "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("Imagen inválida"));
    img.src = URL.createObjectURL(file);
  });
}

async function saveOrder(e) {
  e.preventDefault();
  const msg = document.getElementById("orderFormMsg");
  const btn = document.getElementById("saveOrderBtn");
  msg.className = "form-msg"; msg.textContent = "";

  const cliente = readClientForm();
  const valor = parseNum(document.getElementById("productValue").value);
  const abonoIni = parseNum(document.getElementById("abono").value);
  const productName = document.getElementById("productName").value.trim();
  const file = document.getElementById("productPhoto").files[0];

  if (!productName || !cliente.nombre || !valor) {
    msg.className = "form-msg err"; msg.textContent = "Completa producto, valor y nombre del cliente.";
    return;
  }
  if (!cliente.departamento) {
    msg.className = "form-msg err"; msg.textContent = "Selecciona el departamento del cliente.";
    return;
  }

  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    // Foto (opcional) → se incrusta en el registro. Si falla, se guarda sin foto.
    let fotoURL = null;
    if (file) {
      msg.className = "form-msg"; msg.textContent = "Procesando foto…";
      try { fotoURL = await fileToDataURL(file); }
      catch { fotoURL = null; msg.textContent = "No se pudo procesar la foto; se guarda sin ella."; }
    }

    // N° de cliente (reutiliza el existente por teléfono, o asigna uno nuevo)
    const existing = CLIENTS.find(c =>
      onlyDigits(c.telefono) && onlyDigits(c.telefono) === onlyDigits(cliente.telefono));
    cliente.numero = existing ? existing.numero : nextClientNumber();

    if (FIREBASE_READY) {
      await upsertClient(cliente);
      if (editingOrderId) {
        const update = { productName, valor, cliente,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (fotoURL) update.fotoURL = fotoURL;
        await db.collection("ordenes").doc(editingOrderId).update(update);
      } else {
        const abonos = abonoIni > 0 ? [{ monto: abonoIni, fecha: Date.now() }] : [];
        await db.collection("ordenes").add({
          productName, valor, cliente, fotoURL: fotoURL || null,
          abonos, abono: abonoIni,
          status: "por_comprar", guia: "", tipoEnvio: null,
          historial: { por_comprar: firebase.firestore.FieldValue.serverTimestamp() },
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      upsertClientLocal(cliente);
      if (editingOrderId) {
        const i = ORDERS.findIndex(o => o.id === editingOrderId);
        if (i >= 0) ORDERS[i] = { ...ORDERS[i], productName, valor, cliente,
          updatedAt: Date.now(), ...(fotoURL ? { fotoURL } : {}) };
      } else {
        const abonos = abonoIni > 0 ? [{ monto: abonoIni, fecha: Date.now() }] : [];
        ORDERS.unshift({
          id: newLocalId(),
          productName, valor, cliente, fotoURL: fotoURL || null,
          abonos, abono: abonoIni,
          status: "por_comprar", guia: "", tipoEnvio: null,
          historial: { por_comprar: Date.now() },
          createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
      saveLocal(); renderAllLocal();
    }

    msg.className = "form-msg ok";
    msg.textContent = editingOrderId ? "✓ Orden actualizada." : "✓ Orden creada.";
    resetOrderForm();
    setTimeout(() => showView("tablero"), 500);
  } catch (ex) {
    msg.className = "form-msg err"; msg.textContent = "Error: " + ex.message;
  } finally {
    btn.disabled = false;
    btn.textContent = editingOrderId ? "Guardar cambios" : "Guardar orden";
  }
}

/* ============================================================
   CLIENTES
   ============================================================ */
async function upsertClient(cliente) {
  const existing = CLIENTS.find(c =>
    onlyDigits(c.telefono) && onlyDigits(c.telefono) === onlyDigits(cliente.telefono));
  if (existing) {
    await db.collection("clientes").doc(existing.id).set(
      { ...cliente, numero: existing.numero,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true });
  } else {
    await db.collection("clientes").add({
      ...cliente,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}
function upsertClientLocal(cliente) {
  const i = CLIENTS.findIndex(c =>
    onlyDigits(c.telefono) && onlyDigits(c.telefono) === onlyDigits(cliente.telefono));
  if (i >= 0) CLIENTS[i] = { ...CLIENTS[i], ...cliente };
  else CLIENTS.push({ id: newLocalId(), ...cliente, createdAt: Date.now() });
  CLIENTS.sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));
}

function renderClientDatalist() {
  document.getElementById("clientList").innerHTML =
    CLIENTS.map(c => `<option value="${escapeHtml(c.nombre)}"></option>`).join("");
}

function renderClientsTable() {
  const q = document.getElementById("searchClients").value.toLowerCase().trim();
  const list = CLIENTS.filter(c => !q ||
    [c.nombre, "#" + c.numero, c.telefono, c.ciudad, c.departamento, c.barrio]
      .filter(Boolean).join(" ").toLowerCase().includes(q));

  if (!list.length) {
    document.getElementById("clientsTableWrap").innerHTML =
      `<div class="empty-box">Sin clientes todavía.</div>`;
    return;
  }
  const isAdmin = CURRENT.role === "admin";
  document.getElementById("clientsTableWrap").innerHTML = `
    <table>
      <thead><tr>
        <th>N°</th><th>Nombre</th><th>Teléfono</th><th>Red</th><th>Dirección</th>
        <th>Barrio</th><th>Ciudad</th><th>Departamento</th><th>Pedidos</th>${isAdmin ? "<th></th>" : ""}
      </tr></thead>
      <tbody>
        ${list.map(c => {
          const pedidos = ORDERS.filter(o => (o.cliente || {}).numero === c.numero).length;
          return `<tr>
          <td><strong>#${c.numero ?? "—"}</strong></td>
          <td>${escapeHtml(c.nombre)}</td>
          <td>${escapeHtml(c.telefono)}</td>
          <td>${escapeHtml(c.red || "")}</td>
          <td>${escapeHtml(c.direccion || "")}</td>
          <td>${escapeHtml(c.barrio || "")}</td>
          <td>${escapeHtml(c.ciudad || "")}</td>
          <td>${escapeHtml(c.departamento || c.municipio || "")}</td>
          <td><button class="mini-btn ver" data-ver="${escapeHtml(c.nombre)}">Ver (${pedidos})</button></td>
          ${isAdmin ? `<td><button class="mini-btn" data-del="${c.id}">Eliminar</button></td>` : ""}
        </tr>`; }).join("")}
      </tbody>
    </table>`;

  // Ver pedidos del cliente → filtra el tablero por su nombre
  document.querySelectorAll("[data-ver]").forEach(b =>
    b.addEventListener("click", () => {
      showView("tablero");
      const s = document.getElementById("searchOrders");
      s.value = b.dataset.ver; renderBoard();
    }));

  document.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este cliente de la base de datos?")) return;
      if (!FIREBASE_READY) {
        CLIENTS = CLIENTS.filter(c => c.id !== b.dataset.del);
        saveLocal(); renderAllLocal();
      } else {
        await db.collection("clientes").doc(b.dataset.del).delete();
      }
    }));
}

/* ============================================================
   HISTORIAL (entregados de días anteriores)
   ============================================================ */
function setupHistorial() {
  document.getElementById("searchHistorial").addEventListener("input", renderHistorial);
}
function renderHistorial() {
  const wrap = document.getElementById("historialWrap");
  if (!wrap) return;
  const q = document.getElementById("searchHistorial").value.toLowerCase().trim();
  let list = ORDERS.filter(isArchived);
  if (q) list = list.filter(o => {
    const c = o.cliente || {};
    return [o.productName, c.nombre, "#" + c.numero, c.ciudad, o.guia]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  if (!list.length) {
    wrap.innerHTML = `<div class="empty-box">Aún no hay pedidos en el historial.</div>`;
    return;
  }

  // Agrupar por día de entrega
  const groups = {};
  list.forEach(o => {
    const m = tsMillis(o.historial && o.historial.entregado);
    const key = new Date(m).toISOString().slice(0, 10);
    (groups[key] = groups[key] || []).push(o);
  });
  const days = Object.keys(groups).sort().reverse();

  wrap.innerHTML = days.map(day => {
    const items = groups[day];
    const totalDia = items.reduce((a, o) => a + (o.valor || 0), 0);
    return `
      <div class="hist-day">
        <div class="hist-day-head">
          <span>${fmtDay(items[0].historial.entregado)}</span>
          <span class="hist-count">${items.length} pedido(s) · ${COP(totalDia)}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>Cliente</th><th>Producto</th><th>Ciudad</th><th>Guía</th><th>Valor</th><th>Saldo</th></tr></thead>
            <tbody>
              ${items.map(o => {
                const c = o.cliente || {}; const saldo = saldoDe(o);
                return `<tr class="hist-row" data-id="${o.id}">
                  <td>#${c.numero ?? "—"}</td>
                  <td>${escapeHtml(c.nombre || "")}</td>
                  <td>${escapeHtml(o.productName)}</td>
                  <td>${escapeHtml(c.ciudad || "")}</td>
                  <td>${escapeHtml(o.guia || (o.tipoEnvio === "domicilio" ? "Domicilio" : ""))}</td>
                  <td>${COP(o.valor)}</td>
                  <td>${saldo > 0 ? COP(saldo) : "Pagado ✓"}</td>
                </tr>`; }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join("");

  wrap.querySelectorAll(".hist-row").forEach(r =>
    r.addEventListener("click", () => openOrderModal(r.dataset.id)));
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function setupDashboard() {
  ["dashFrom", "dashTo"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderDashboard));
  document.getElementById("dashClearBtn").addEventListener("click", () => {
    document.getElementById("dashFrom").value = "";
    document.getElementById("dashTo").value = "";
    renderDashboard();
  });
}

function dashInRange(o) {
  const from = document.getElementById("dashFrom").value;
  const to = document.getElementById("dashTo").value;
  const m = tsMillis(o.createdAt);
  if (from && m < new Date(from + "T00:00:00").getTime()) return false;
  if (to && m > new Date(to + "T23:59:59").getTime()) return false;
  return true;
}

function renderDashboard() {
  const statsEl = document.getElementById("dashStats");
  const breakEl = document.getElementById("dashBreakdown");
  if (!statsEl) return;

  const orders = ORDERS.filter(dashInRange);
  const facturado = orders.reduce((a, o) => a + (o.valor || 0), 0);
  const recaudado = orders.reduce((a, o) => a + abonoTotal(o), 0);
  const activos = orders.filter(o => o.status !== "entregado");
  const enProceso = activos.reduce((a, o) => a + Math.max(0, saldoDe(o)), 0);
  const entregados = orders.filter(o => o.status === "entregado");
  const valorEntregado = entregados.reduce((a, o) => a + (o.valor || 0), 0);
  const porCobrarTotal = orders.reduce((a, o) => a + Math.max(0, saldoDe(o)), 0);

  statsEl.innerHTML = `
    <div class="stat money"><div class="num">${COP(recaudado)}</div><div class="lbl">Dinero recaudado</div></div>
    <div class="stat money"><div class="num">${COP(enProceso)}</div><div class="lbl">Dinero en proceso (saldo activos)</div></div>
    <div class="stat money"><div class="num">${COP(porCobrarTotal)}</div><div class="lbl">Total por cobrar</div></div>
    <div class="stat money"><div class="num">${COP(facturado)}</div><div class="lbl">Total facturado</div></div>
    <div class="stat"><div class="num">${orders.length}</div><div class="lbl">Pedidos (en el rango)</div></div>
    <div class="stat"><div class="num">${entregados.length}</div><div class="lbl">Entregados exitosamente</div></div>
    <div class="stat money"><div class="num">${COP(valorEntregado)}</div><div class="lbl">Valor de entregados</div></div>`;

  const perStatus = STATUSES.map(s => {
    const list = orders.filter(o => o.status === s.key);
    const monto = list.reduce((a, o) => a + Math.max(0, saldoDe(o)), 0);
    return { s, n: list.length, monto };
  });

  breakEl.innerHTML = `
    <div class="detail-section-title" style="margin-top:24px">Pedidos por proceso</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Proceso</th><th>Pedidos</th><th>Saldo por cobrar</th></tr></thead>
        <tbody>
          ${perStatus.map(r => `<tr>
            <td><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${r.s.color};margin-right:8px"></span>${r.s.label}</td>
            <td>${r.n}</td>
            <td>${COP(r.monto)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="section-note">“Dinero recaudado” = suma de todos los abonos recibidos. Para ver utilidad neta habría que registrar el costo de compra en cada pedido.</p>`;
}

/* ============================================================
   EXPORTAR A EXCEL (SheetJS)
   ============================================================ */
function exportClients() {
  if (!CLIENTS.length) { alert("No hay clientes para exportar."); return; }
  const rows = CLIENTS.map(c => ({
    "N° cliente": c.numero, Nombre: c.nombre, Teléfono: c.telefono, "Red social": c.red || "",
    Dirección: c.direccion, Barrio: c.barrio, "Punto de referencia": c.referencia || "",
    Ciudad: c.ciudad, Departamento: c.departamento || c.municipio || "",
  }));
  downloadXlsx(rows, "Clientes", `clientes_${hoy()}`);
}

function orderRows(list) {
  return list.map(o => {
    const c = o.cliente || {}; const saldo = saldoDe(o);
    return {
      "N° cliente": c.numero, Producto: o.productName, Estado: statusLabel(o.status),
      Valor: o.valor || 0, Abonado: abonoTotal(o), Saldo: Math.max(0, saldo),
      "Guía EE.UU.": o.guiaUsa || "",
      "Tipo envío": o.tipoEnvio === "domicilio" ? "Domicilio" : (o.tipoEnvio ? "Interrapidísimo" : ""),
      "Guía Colombia": o.guia || "", Cliente: c.nombre, Teléfono: c.telefono, "Red social": c.red || "",
      Dirección: c.direccion, Barrio: c.barrio, Referencia: c.referencia || "",
      Ciudad: c.ciudad, Departamento: c.departamento || c.municipio || "",
      Creada: fmtDate(o.createdAt), Entregada: o.historial && o.historial.entregado ? fmtDate(o.historial.entregado) : "",
    };
  });
}
function exportOrders() {
  if (!ORDERS.length) { alert("No hay órdenes para exportar."); return; }
  downloadXlsx(orderRows(ORDERS.filter(o => !isArchived(o))), "Órdenes", `ordenes_${hoy()}`);
}
function exportHistorial() {
  const list = ORDERS.filter(isArchived);
  if (!list.length) { alert("No hay historial para exportar."); return; }
  downloadXlsx(orderRows(list), "Historial", `historial_${hoy()}`);
}
function downloadXlsx(rows, sheet, name) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, name + ".xlsx");
}
const hoy = () => new Date().toISOString().slice(0, 10);

/* ============================================================
   ARRANQUE
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupFilters();
  setupOrderForm();
  setupHistorial();
  setupDashboard();

  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  document.getElementById("orderModal").addEventListener("click", e => {
    if (e.target.id === "orderModal") closeModal();
  });
  document.getElementById("exportClientsBtn").addEventListener("click", exportClients);
  document.getElementById("exportOrdersBtn").addEventListener("click", exportOrders);
  document.getElementById("exportHistorialBtn").addEventListener("click", exportHistorial);
  document.getElementById("searchClients").addEventListener("input", renderClientsTable);

  wireLogin();
  FIREBASE_READY = initFirebase();
  if (FIREBASE_READY) restoreSession();
});
