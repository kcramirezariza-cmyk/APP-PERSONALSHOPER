# 🚀 Guía de publicación — ARMADIUSA

Guía paso a paso para poner tu sitio en internet. Sigue las 3 partes en orden.
No necesitas instalar nada ni escribir comandos: todo se hace desde la web.

> **Archivos que vas a subir** (están en la carpeta `personal-shopper`):
> `index.html`, `styles.css`, `app.js`, `firebase-config.js`, `logo.svg`,
> `firestore.rules`, `README.md`, `GUIA-PUBLICACION.md`

---

## PARTE 1 · Publicar en GitHub Pages

### 1.1 Crear cuenta (si aún no tienes)
- [ ] Entra a <https://github.com> → **Sign up** → crea tu cuenta con tu correo.

### 1.2 Crear el repositorio
- [ ] Arriba a la derecha, clic en **+** → **New repository**.
- [ ] **Repository name:** `armadiusa` (o el nombre que quieras).
- [ ] Marca **Public** (obligatorio para GitHub Pages gratis).
- [ ] Clic en **Create repository**.

### 1.3 Subir los archivos
- [ ] En la página del repo nuevo, clic en el enlace **“uploading an existing file”**
      (o botón **Add file → Upload files**).
- [ ] Abre la carpeta `personal-shopper` en tu computador y **arrastra TODOS los archivos**
      de adentro a la ventana de GitHub.
      > ⚠️ Importante: arrastra el **contenido** de la carpeta (que `index.html` quede
      > en la raíz), NO la carpeta completa.
- [ ] Abajo, clic en **Commit changes**.

### 1.4 Activar GitHub Pages
- [ ] En el repo, ve a **Settings** (arriba) → en el menú izquierdo, **Pages**.
- [ ] En **Source**, elige **Deploy from a branch**.
- [ ] En **Branch**, selecciona **main** y carpeta **/ (root)** → **Save**.
- [ ] Espera 1–2 minutos. Recarga la página de Pages y aparecerá tu enlace:
      **`https://TU-USUARIO.github.io/armadiusa/`**

✅ **Tu sitio ya está público.** Ábrelo: verás el login. Si entras con
`admin` / `110826` verás el aviso “Modo de prueba” — es normal, todavía falta
conectar Firebase (Parte 2) para que guarde datos de verdad.

---

## PARTE 2 · Configurar Firebase (guardar y sincronizar datos)

### 2.1 Crear el proyecto
- [ ] Entra a <https://console.firebase.google.com> → **Agregar proyecto**.
- [ ] Nombre: `armadiusa` → Continuar. (Google Analytics puedes desactivarlo) → **Crear proyecto**.

### 2.2 Activar los 3 servicios
En el menú **Compilación** (Build):

- [ ] **Authentication** → *Comenzar* → pestaña **Sign-in method** →
      habilita **Anónimo (Anonymous)** → **Guardar**.
- [ ] **Firestore Database** → *Crear base de datos* → **modo de producción** →
      región (elige `us-central` o `nam5`) → **Habilitar**.

> 📷 **Nota:** las fotos de los productos se guardan comprimidas dentro del mismo
> registro (Firestore). **No necesitas activar Storage** ni el plan de pago.

### 2.3 Obtener tus claves
- [ ] Arriba, icono **⚙️ engranaje** → **Configuración del proyecto**.
- [ ] Baja hasta **Tus apps** → clic en el icono web **`</>`**.
- [ ] Ponle un apodo (`armadiusa-web`) → **Registrar app**.
- [ ] Copia el bloque `firebaseConfig` que te muestra (las claves).

### 2.4 Pegar las claves en el sitio
- [ ] En tu repo de GitHub, abre el archivo **`firebase-config.js`**.
- [ ] Clic en el **lápiz ✏️ (Edit)** arriba a la derecha.
- [ ] Reemplaza los valores de ejemplo por los tuyos (apiKey, projectId, etc.).
- [ ] Abajo, **Commit changes**. (GitHub Pages se actualiza solo en 1 min.)

### 2.5 Publicar las reglas de seguridad
- [ ] En Firebase → **Firestore Database → Reglas**: pega el contenido de
      `firestore.rules` → **Publicar**.

### 2.6 Autorizar tu dominio de GitHub
- [ ] En Firebase → **Authentication → Settings (Configuración) → Dominios autorizados**
      → **Agregar dominio** → escribe `TU-USUARIO.github.io` → **Agregar**.

✅ **Listo.** Ahora abre tu sitio, entra con `admin` / `110826`, crea una orden de
prueba y comprueba que se guarda. Ábrelo en otro dispositivo (o desde Colombia):
verás la misma información. **El aviso “Modo de prueba” desaparece.**

---

## PARTE 3 · Verificación final
- [ ] Entro con `admin` / `110826` (ya sin aviso de “Modo de prueba”).
- [ ] Creo una orden con foto → aparece en el tablero.
- [ ] La abro y avanzo un estado → se actualiza.
- [ ] Reviso la pestaña **Clientes** → el cliente quedó guardado.
- [ ] Exporto a **Excel** → descarga el archivo.
- [ ] Abro el sitio en el celular / otro equipo → veo lo mismo.

---

## PARTE 4 · Dominio propio (cuando lo compres)

Cuando compres tu dominio (ej. `www.armadiusa.com`), avísame y te doy los pasos
exactos según dónde lo compres. En resumen será:

1. En tu proveedor del dominio (Namecheap, GoDaddy, etc.): configurar el **DNS**
   apuntando a GitHub (un registro **CNAME** `www → TU-USUARIO.github.io`, y si
   quieres el dominio “pelado”, unos registros **A** a las IP de GitHub).
2. En GitHub → **Settings → Pages → Custom domain**: escribir tu dominio y guardar.
3. Activar **Enforce HTTPS** (candado seguro).
4. En Firebase → **Authentication → Dominios autorizados**: agregar el dominio nuevo.

> 📌 **Pendiente:** el dominio aún no está comprado. Cuando lo tengas, seguimos con esta parte.

---

## ❓ Si algo falla
- **La página sale en blanco / error 404 en GitHub:** revisa que `index.html`
  esté en la raíz del repo (no dentro de una subcarpeta).
- **Dice “Activa Anónimo…”:** faltó el paso 2.2 (habilitar Anonymous en Authentication).
- **No guarda / error de permisos:** faltó publicar las reglas (paso 2.5) o autorizar
  el dominio (paso 2.6).
- **Sigue en “Modo de prueba”:** las claves de `firebase-config.js` aún son las de
  ejemplo, o no se actualizó el archivo en GitHub (paso 2.4).
