/* ============================================================
   ENVÍOS USA → COLOMBIA · Personal Shopper
   Lógica de la aplicación (Firebase compat)
   ============================================================ */

/* ---------- Definición del flujo de estados ---------- */
const STATUSES = [
  { key: "por_comprar",  label: "Por comprar",  color: "#a1a1aa" },
  { key: "por_empacar",  label: "Por empacar",  color: "#8b8b93" },
  { key: "por_enviar",   label: "Por enviar",   color: "#71717a" },
  { key: "enviado",      label: "Enviado (a Col)", color: "#5c5c64" },
  { key: "recibido_col", label: "Recibido Col", color: "#46464d" },
  { key: "enviado_col",  label: "Enviado Col",  color: "#2f2f35" },
  { key: "entregado",    label: "Entregado",    color: "#18181b" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));
const statusIndex = k => STATUSES.findIndex(s => s.key === k);
const statusLabel = k => (STATUS_MAP[k] ? STATUS_MAP[k].label : k);
const statusColor = k => (STATUS_MAP[k] ? STATUS_MAP[k].color : "#8b95b0");

/* ---------- Utilidades de formato ---------- */
const COP = n => "$" + (Number(n) || 0).toLocaleString("es-CO");
const onlyDigits = s => (s || "").toString().replace(/\D/g, "");
const parseNum = s => Number(onlyDigits(s)) || 0;
const fmtThousands = s => {
  const d = onlyDigits(s);
  return d ? Number(d).toLocaleString("es-CO") : "";
};
const fmtDate = ts => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) +
         " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};
const escapeHtml = s => (s == null ? "" : String(s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

/* ---------- Acceso (para cambiar usuario/clave, edita estas 2 líneas) ---------- */
const ADMIN_USER = "admin";
const ADMIN_PASS = "110826";

/* ---------- Estado global ---------- */
let db, auth, storage;
let ORDERS = [];
let CLIENTS = [];
let editingOrderId = null;
let unsubOrders = null, unsubClients = null;
let listenersStarted = false;
let FIREBASE_READY = false;

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
  storage = firebase.storage();
  return true;
}

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */
function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userEmail").textContent = ADMIN_USER;
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

// Muestra un aviso dentro del tablero (nunca deja la pantalla en blanco).
function offlineNote(msg) {
  const stats = document.getElementById("statsRow");
  if (stats) stats.innerHTML = "";
  const board = document.getElementById("board");
  if (board) board.innerHTML =
    `<div style="padding:18px 20px;color:var(--amber);background:var(--card);
      border:1px solid var(--line);border-radius:12px;max-width:640px;line-height:1.5">
      ⚠ ${escapeHtml(msg)}</div>`;
}

// Engancha el formulario de login SIEMPRE (aunque Firebase no esté listo),
// así el envío del formulario nunca recarga la página dejándola en blanco.
function wireLogin() {
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const user = document.getElementById("loginEmail").value.trim().toLowerCase();
    const pass = document.getElementById("loginPassword").value;
    const err = document.getElementById("loginError");
    const btn = document.getElementById("loginBtn");
    err.textContent = "";

    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      err.textContent = "Usuario o clave incorrectos.";
      return;
    }

    localStorage.setItem("armadiusa_ok", "1");
    btn.disabled = true; btn.textContent = "Ingresando…";
    try {
      if (FIREBASE_READY && auth && !auth.currentUser) {
        await auth.signInAnonymously();
      }
      showApp();
    } catch (ex) {
      const code = ex.code || ex.message || "";
      showApp(); // entra igual; nunca dejamos la pantalla en blanco
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

// Restaura la sesión al recargar (si ya había ingresado).
function restoreSession() {
  auth.onAuthStateChanged(() => {
    if (localStorage.getItem("armadiusa_ok") === "1") showApp();
  });
}

/* ============================================================
   LISTENERS EN TIEMPO REAL (Firestore)
   ============================================================ */
function startListeners() {
  unsubOrders = db.collection("ordenes").orderBy("createdAt", "desc")
    .onSnapshot(snap => {
      ORDERS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderBoard();
      renderStats();
    }, err => console.error("Órdenes:", err));

  unsubClients = db.collection("clientes").orderBy("nombre")
    .onSnapshot(snap => {
      CLIENTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderClientDatalist();
      renderClientsTable();
    }, err => console.error("Clientes:", err));
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
  renderBoard(); renderStats(); renderClientDatalist(); renderClientsTable();
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

function upsertClientLocal(cliente) {
  const i = CLIENTS.findIndex(c =>
    onlyDigits(c.telefono) && onlyDigits(c.telefono) === onlyDigits(cliente.telefono));
  if (i >= 0) CLIENTS[i] = { ...CLIENTS[i], ...cliente };
  else CLIENTS.push({ id: newLocalId(), ...cliente, createdAt: Date.now() });
  CLIENTS.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

// Convierte la foto a un dato incrustado (para pruebas sin Storage).
async function fileToDataURL(file) {
  const blob = await compressImage(file, 800, 0.6);
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(blob);
  });
}

/* ============================================================
   NAVEGACIÓN ENTRE VISTAS
   ============================================================ */
function setupNav() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });
}
function showView(view) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById("view-" + view).classList.remove("hidden");
  if (view === "nueva" && !editingOrderId) resetOrderForm();
}

/* ============================================================
   TABLERO (KANBAN)
   ============================================================ */
function getFilteredOrders() {
  const q = document.getElementById("searchOrders").value.toLowerCase().trim();
  const st = document.getElementById("filterStatus").value;
  return ORDERS.filter(o => {
    if (st && o.status !== st) return false;
    if (!q) return true;
    const hay = [o.productName, o.cliente?.nombre, o.cliente?.ciudad,
      o.cliente?.municipio, o.guia, o.cliente?.telefono]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderBoard() {
  const board = document.getElementById("board");
  const orders = getFilteredOrders();
  board.innerHTML = STATUSES.map(s => {
    const list = orders.filter(o => o.status === s.key);
    return `
      <div class="col">
        <div class="col-head">
          <span class="title"><span class="dot" style="background:${s.color}"></span>${s.label}</span>
          <span class="count">${list.length}</span>
        </div>
        <div class="col-body">
          ${list.map(cardHTML).join("") || `<div style="color:var(--muted);font-size:12px;padding:8px;text-align:center">—</div>`}
        </div>
      </div>`;
  }).join("");

  board.querySelectorAll(".card").forEach(el =>
    el.addEventListener("click", () => openOrderModal(el.dataset.id)));
}

function cardHTML(o) {
  const saldo = (o.valor || 0) - (o.abono || 0);
  const paid = saldo <= 0;
  const thumb = o.fotoURL
    ? `<img class="thumb" src="${o.fotoURL}" alt="" loading="lazy" />`
    : `<div class="thumb"></div>`;
  return `
    <div class="card" data-id="${o.id}">
      <div class="row1">
        ${thumb}
        <div>
          <div class="pname">${escapeHtml(o.productName)}</div>
          <div class="cname">${escapeHtml(o.cliente?.nombre || "—")}</div>
        </div>
      </div>
      <div class="meta">
        <span class="city">${escapeHtml(o.cliente?.ciudad || "")}</span>
        <span class="saldo-tag ${paid ? "paid" : "pend"}">
          ${paid ? "Pagado ✓" : "Debe " + COP(saldo)}
        </span>
      </div>
      ${o.guia ? `<div class="guia">Guía: ${escapeHtml(o.guia)}</div>` : ""}
    </div>`;
}

function renderStats() {
  const total = ORDERS.length;
  const activos = ORDERS.filter(o => o.status !== "entregado").length;
  const porCobrar = ORDERS.reduce((a, o) => a + Math.max(0, (o.valor || 0) - (o.abono || 0)), 0);
  const abonado = ORDERS.reduce((a, o) => a + (o.abono || 0), 0);
  document.getElementById("statsRow").innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="lbl">Órdenes totales</div></div>
    <div class="stat"><div class="num">${activos}</div><div class="lbl">En proceso</div></div>
    <div class="stat money"><div class="num">${COP(porCobrar)}</div><div class="lbl">Saldo por cobrar</div></div>
    <div class="stat money"><div class="num">${COP(abonado)}</div><div class="lbl">Total abonado</div></div>`;
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
   MODAL DE DETALLE + AVANCE DE ESTADO
   ============================================================ */
function openOrderModal(id) {
  const o = ORDERS.find(x => x.id === id);
  if (!o) return;
  const saldo = (o.valor || 0) - (o.abono || 0);
  const idx = statusIndex(o.status);

  const timeline = STATUSES.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    const when = o.historial?.[s.key];
    return `<div class="tl-step ${cls}">
      <span class="tl-dot"></span>
      <span class="tl-label">${s.label}</span>
      <span class="tl-date">${when ? fmtDate(when) : ""}</span>
    </div>`;
  }).join("");

  const c = o.cliente || {};
  const nextStatus = STATUSES[idx + 1];

  // Botón de avance. Si el siguiente estado es "enviado_col" se pide guía.
  let advanceUI = "";
  if (o.status === "entregado") {
    advanceUI = `<span class="badge done">✓ Proceso completo</span>`;
  } else if (o.status === "recibido_col") {
    // Para pasar a "Enviado Col" se requiere la guía de Interrapidísimo
    advanceUI = `
      <div style="width:100%">
        <div class="detail-section-title">Generar guía Interrapidísimo</div>
        <div class="guia-input-row">
          <input type="text" id="guiaInput" placeholder="Número de guía Interrapidísimo" value="${escapeHtml(o.guia || "")}" />
          <button class="btn-primary" id="advanceBtn">Marcar Enviado Col →</button>
        </div>
      </div>`;
  } else {
    advanceUI = `<button class="btn-primary" id="advanceBtn">Avanzar a: ${nextStatus.label} →</button>`;
  }

  document.getElementById("orderModalBody").innerHTML = `
    ${o.fotoURL ? `<img class="detail-photo" src="${o.fotoURL}" alt="Producto" />` : ""}
    <h2 style="margin:0 0 4px">${escapeHtml(o.productName)}</h2>
    <span class="badge">${statusLabel(o.status)}</span>

    <div class="detail-section-title">Pago</div>
    <div class="detail-row"><span class="k">Valor del producto</span><span>${COP(o.valor)}</span></div>
    <div class="detail-row"><span class="k">Abonado</span><span>${COP(o.abono)}</span></div>
    <div class="detail-row"><span class="k">Saldo pendiente</span>
      <span style="color:${saldo > 0 ? "var(--amber)" : "var(--green)"};font-weight:700">
        ${saldo > 0 ? COP(saldo) : "Pagado ✓"}</span></div>

    <div class="detail-section-title">Cliente</div>
    <div class="detail-row"><span class="k">Nombre</span><span>${escapeHtml(c.nombre)}</span></div>
    <div class="detail-row"><span class="k">Teléfono</span><span>${escapeHtml(c.telefono)}</span></div>
    ${c.red ? `<div class="detail-row"><span class="k">Red social</span><span>${escapeHtml(c.red)}</span></div>` : ""}
    <div class="detail-row"><span class="k">Dirección</span><span>${escapeHtml(c.direccion)}</span></div>
    <div class="detail-row"><span class="k">Barrio</span><span>${escapeHtml(c.barrio)}</span></div>
    ${c.referencia ? `<div class="detail-row"><span class="k">Referencia</span><span>${escapeHtml(c.referencia)}</span></div>` : ""}
    <div class="detail-row"><span class="k">Ciudad</span><span>${escapeHtml(c.ciudad)}</span></div>
    <div class="detail-row"><span class="k">Municipio</span><span>${escapeHtml(c.municipio)}</span></div>
    ${o.guia ? `<div class="detail-row"><span class="k">Guía Interrapidísimo</span><span>${escapeHtml(o.guia)}</span></div>` : ""}

    <div class="detail-section-title">Recorrido</div>
    <div class="timeline">${timeline}</div>

    <div class="modal-actions">
      ${advanceUI}
      <button class="btn-secondary" id="editOrderBtn">✎ Editar</button>
      <button class="btn-ghost" id="deleteOrderBtn" style="color:var(--red);border-color:var(--red)">Eliminar</button>
    </div>`;

  document.getElementById("orderModal").classList.remove("hidden");

  const advBtn = document.getElementById("advanceBtn");
  if (advBtn) advBtn.addEventListener("click", () => advanceStatus(o));
  document.getElementById("editOrderBtn").addEventListener("click", () => { closeModal(); editOrder(o.id); });
  document.getElementById("deleteOrderBtn").addEventListener("click", () => deleteOrder(o.id));
}

function closeModal() { document.getElementById("orderModal").classList.add("hidden"); }

async function advanceStatus(o) {
  const idx = statusIndex(o.status);
  const next = STATUSES[idx + 1];
  if (!next) return;

  // Al pasar a "Enviado Col" se exige el número de guía
  let guia = null;
  if (next.key === "enviado_col") {
    guia = document.getElementById("guiaInput")?.value.trim();
    if (!guia) { alert("Ingresa el número de guía de Interrapidísimo."); return; }
  }

  if (!FIREBASE_READY) {
    // MODO DE PRUEBA
    const i = ORDERS.findIndex(x => x.id === o.id);
    if (i >= 0) {
      ORDERS[i].status = next.key;
      ORDERS[i].updatedAt = Date.now();
      ORDERS[i].historial = { ...(ORDERS[i].historial || {}), [next.key]: Date.now() };
      if (guia) { ORDERS[i].guia = guia; ORDERS[i].rastreoActivo = true; }
    }
    saveLocal(); renderAllLocal(); closeModal();
    return;
  }

  const update = {
    status: next.key,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    [`historial.${next.key}`]: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (guia) {
    update.guia = guia;
    // Enganche para rastreo automático (Cloud Function): al tener guía, el
    // backend podrá consultar Interrapidísimo y mover a "entregado" solo.
    update.rastreoActivo = true;
  }

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

  // Foto: vista previa
  document.getElementById("productPhoto").addEventListener("change", e => {
    const file = e.target.files[0];
    const wrap = document.getElementById("photoPreviewWrap");
    if (!file) { wrap.classList.add("hidden"); return; }
    document.getElementById("photoPreview").src = URL.createObjectURL(file);
    wrap.classList.remove("hidden");
  });

  // Autocompletar cliente existente
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
  document.getElementById("cMunicipio").value = c.municipio || "";
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
    municipio: document.getElementById("cMunicipio").value.trim(),
  };
}

function resetOrderForm() {
  editingOrderId = null;
  document.getElementById("orderForm").reset();
  document.getElementById("orderFormTitle").textContent = "Nueva orden";
  document.getElementById("saveOrderBtn").textContent = "Guardar orden";
  document.getElementById("photoPreviewWrap").classList.add("hidden");
  document.getElementById("orderFormMsg").textContent = "";
  document.getElementById("productPhoto").required = true;
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
  document.getElementById("abono").value = fmtThousands(String(o.abono || ""));
  const saldo = (o.valor || 0) - (o.abono || 0);
  document.getElementById("saldoView").value = COP(Math.max(0, saldo));
  fillClient(o.cliente || {});
  // Al editar la foto es opcional (se conserva la existente)
  document.getElementById("productPhoto").required = false;
  if (o.fotoURL) {
    document.getElementById("photoPreview").src = o.fotoURL;
    document.getElementById("photoPreviewWrap").classList.remove("hidden");
  }
}

/* Comprime la imagen en el navegador antes de subir (ahorra espacio y datos) */
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
  const abono = parseNum(document.getElementById("abono").value);
  const productName = document.getElementById("productName").value.trim();
  const file = document.getElementById("productPhoto").files[0];

  if (!productName || !cliente.nombre || !valor) {
    msg.className = "form-msg err"; msg.textContent = "Completa producto, valor y nombre del cliente.";
    return;
  }
  if (!editingOrderId && !file) {
    msg.className = "form-msg err"; msg.textContent = "Sube una foto del producto.";
    return;
  }

  btn.disabled = true; btn.textContent = "Guardando…";
  try {
    // 1) Procesar foto (nube con Firebase; incrustada en modo de prueba)
    let fotoURL = null;
    if (file) {
      msg.className = "form-msg"; msg.textContent = "Procesando foto…";
      if (FIREBASE_READY) {
        const blob = await compressImage(file);
        const path = `productos/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const ref = storage.ref().child(path);
        await ref.put(blob, { contentType: "image/jpeg" });
        fotoURL = await ref.getDownloadURL();
      } else {
        fotoURL = await fileToDataURL(file);
      }
    }

    if (FIREBASE_READY) {
      // 2) Guardar / actualizar cliente
      await upsertClient(cliente);
      // 3) Guardar la orden
      if (editingOrderId) {
        const update = { productName, valor, abono, cliente,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (fotoURL) update.fotoURL = fotoURL;
        await db.collection("ordenes").doc(editingOrderId).update(update);
      } else {
        await db.collection("ordenes").add({
          productName, valor, abono, cliente, fotoURL,
          status: "por_comprar",
          guia: "",
          historial: { por_comprar: firebase.firestore.FieldValue.serverTimestamp() },
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      // MODO DE PRUEBA (localStorage)
      upsertClientLocal(cliente);
      if (editingOrderId) {
        const i = ORDERS.findIndex(o => o.id === editingOrderId);
        if (i >= 0) ORDERS[i] = { ...ORDERS[i], productName, valor, abono, cliente,
          updatedAt: Date.now(), ...(fotoURL ? { fotoURL } : {}) };
      } else {
        ORDERS.unshift({
          id: newLocalId(),
          productName, valor, abono, cliente, fotoURL: fotoURL || null,
          status: "por_comprar", guia: "",
          historial: { por_comprar: Date.now() },
          createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
      saveLocal();
      renderAllLocal();
    }

    msg.className = "form-msg ok";
    msg.textContent = editingOrderId ? "✓ Orden actualizada." : "✓ Orden creada.";
    resetOrderForm();
    setTimeout(() => showView("tablero"), 600);
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
  // Buscamos por teléfono (identificador razonable). Si existe, actualizamos.
  const existing = CLIENTS.find(c =>
    onlyDigits(c.telefono) && onlyDigits(c.telefono) === onlyDigits(cliente.telefono));
  if (existing) {
    await db.collection("clientes").doc(existing.id).set(
      { ...cliente, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true });
  } else {
    await db.collection("clientes").add({
      ...cliente,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}

function renderClientDatalist() {
  document.getElementById("clientList").innerHTML =
    CLIENTS.map(c => `<option value="${escapeHtml(c.nombre)}"></option>`).join("");
}

function renderClientsTable() {
  const q = document.getElementById("searchClients").value.toLowerCase().trim();
  const list = CLIENTS.filter(c => !q ||
    [c.nombre, c.telefono, c.ciudad, c.municipio, c.barrio].filter(Boolean)
      .join(" ").toLowerCase().includes(q));

  if (!list.length) {
    document.getElementById("clientsTableWrap").innerHTML =
      `<div style="padding:24px;text-align:center;color:var(--muted)">Sin clientes todavía.</div>`;
    return;
  }
  document.getElementById("clientsTableWrap").innerHTML = `
    <table>
      <thead><tr>
        <th>Nombre</th><th>Teléfono</th><th>Red</th><th>Dirección</th>
        <th>Barrio</th><th>Ciudad</th><th>Municipio</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(c => `<tr>
          <td>${escapeHtml(c.nombre)}</td>
          <td>${escapeHtml(c.telefono)}</td>
          <td>${escapeHtml(c.red || "")}</td>
          <td>${escapeHtml(c.direccion || "")}</td>
          <td>${escapeHtml(c.barrio || "")}</td>
          <td>${escapeHtml(c.ciudad || "")}</td>
          <td>${escapeHtml(c.municipio || "")}</td>
          <td><button class="mini-btn" data-del="${c.id}">Eliminar</button></td>
        </tr>`).join("")}
      </tbody>
    </table>`;

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
   EXPORTAR A EXCEL (SheetJS)
   ============================================================ */
function exportClients() {
  if (!CLIENTS.length) { alert("No hay clientes para exportar."); return; }
  const rows = CLIENTS.map(c => ({
    Nombre: c.nombre, Teléfono: c.telefono, "Red social": c.red || "",
    Dirección: c.direccion, Barrio: c.barrio, "Punto de referencia": c.referencia || "",
    Ciudad: c.ciudad, Municipio: c.municipio,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  XLSX.writeFile(wb, `clientes_${hoy()}.xlsx`);
}

function exportOrders() {
  if (!ORDERS.length) { alert("No hay órdenes para exportar."); return; }
  const rows = ORDERS.map(o => {
    const c = o.cliente || {};
    const saldo = (o.valor || 0) - (o.abono || 0);
    return {
      Producto: o.productName,
      Estado: statusLabel(o.status),
      Valor: o.valor || 0,
      Abono: o.abono || 0,
      Saldo: Math.max(0, saldo),
      Guía: o.guia || "",
      Cliente: c.nombre, Teléfono: c.telefono, "Red social": c.red || "",
      Dirección: c.direccion, Barrio: c.barrio, "Referencia": c.referencia || "",
      Ciudad: c.ciudad, Municipio: c.municipio,
      "Creada": fmtDate(o.createdAt),
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Órdenes");
  XLSX.writeFile(wb, `ordenes_${hoy()}.xlsx`);
}
const hoy = () => new Date().toISOString().slice(0, 10);

/* ============================================================
   ARRANQUE
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupFilters();
  setupOrderForm();

  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  document.getElementById("orderModal").addEventListener("click", e => {
    if (e.target.id === "orderModal") closeModal();
  });
  document.getElementById("exportClientsBtn").addEventListener("click", exportClients);
  document.getElementById("exportOrdersBtn").addEventListener("click", exportOrders);
  document.getElementById("searchClients").addEventListener("input", renderClientsTable);

  wireLogin();                       // el login funciona siempre
  FIREBASE_READY = initFirebase();   // intenta conectar Firebase
  if (FIREBASE_READY) restoreSession();
});
