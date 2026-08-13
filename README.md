# 📦✈️ ARMADIUSA · Envíos USA → Colombia

App web para gestionar órdenes de compra en EE.UU. y sus envíos a Colombia.
Funciona en dos lugares a la vez (EE.UU. y Colombia) con datos **en tiempo real**
gracias a Firebase, y se publica gratis en **GitHub Pages**.

## ✨ Qué hace

- Subir órdenes con **foto real** del producto + datos del cliente.
- **Tablero** con el recorrido de 7 estados:
  `Por comprar → Por empacar → Por enviar → Enviado → Recibido Col → Enviado Col → Entregado`
- Control de **abonos y saldo pendiente** por orden.
- **Base de datos de clientes** con exportación a **Excel**.
- Exportación de **órdenes a Excel**.
- **Login** con usuario y contraseña (protege los datos personales).
- Número de **guía Interrapidísimo** por orden (enganche listo para automatizar).

---

## 🚀 Instalación (una sola vez, ~10 minutos)

### 1. Crear el proyecto en Firebase
1. Entra a <https://console.firebase.google.com> y crea un proyecto (gratis).
2. En el menú **Compilación**, activa estos 3 servicios:
   - **Authentication** → pestaña *Sign-in method* → habilita **Anónimo** (Anonymous).
   - **Firestore Database** → *Crear base de datos* → modo producción → región (elige `nam5` o la más cercana).
   - **Storage** → *Comenzar* → modo producción.

### 2. Acceso a la app
El usuario y la clave están definidos **dentro de la app**, no se crean en Firebase:

| Usuario | Clave |
|---|---|
| `admin` | `110826` |

> Para cambiarlos, edita las 2 primeras líneas de `app.js`
> (`ADMIN_USER` y `ADMIN_PASS`).
> La opción **Anónimo** de Firebase es solo para que la base de datos siga
> protegida por sesión; no tienes que crear ningún usuario ahí.

### 3. Pegar la configuración
1. En **Configuración del proyecto** (engranaje) → *Tus apps* → icono **`</>`** (Web) → registra la app.
2. Copia el objeto `firebaseConfig` y pégalo en el archivo **`firebase-config.js`**.

### 4. Publicar las reglas de seguridad
- **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica.
- **Storage → Reglas**: pega el contenido de `storage.rules` y publica.

> Estas reglas exigen haber iniciado sesión, así nadie sin cuenta puede ver los datos.

### 5. Subir a GitHub Pages
1. Crea un repositorio en GitHub y sube estos archivos (`index.html`, `styles.css`,
   `app.js`, `firebase-config.js`).
2. En el repo: **Settings → Pages → Source: `main` / carpeta raíz (`/root`)** → guarda.
3. En unos minutos tendrás la URL pública (ej: `https://tuusuario.github.io/tu-repo/`).
4. Ábrela en EE.UU. y en Colombia: ambas verán las mismas órdenes en tiempo real.

> **Importante:** en **Authentication → Settings → Dominios autorizados**, agrega
> tu dominio de GitHub Pages (`tuusuario.github.io`) para que el login funcione ahí.

---

## 🔄 Rastreo automático de Interrapidísimo (fase 2)

Una página estática **no puede** consultar sola a Interrapidísimo (bloqueo CORS y
necesita credenciales). Para marcar **"Entregado" automáticamente** se necesita una
**Firebase Cloud Function** que:

1. Se ejecute cada X horas (Cloud Scheduler).
2. Lea las órdenes con `rastreoActivo == true` y su número de `guia`.
3. Consulte el estado en Interrapidísimo (con las credenciales de la cuenta).
4. Si figura como entregado, actualice la orden a `status: "entregado"`.

La app ya deja el enganche listo: al generar la guía guarda `guia` y
`rastreoActivo: true`. Cuando quieras, se agrega la Cloud Function y todo lo demás
sigue igual. (Requiere el plan **Blaze** de Firebase —de pago por uso, prácticamente
gratis en este volumen— porque las funciones necesitan salida a internet.)

Mientras tanto, "Entregado" se marca con un clic desde el tablero.

---

## 📁 Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Diseño |
| `app.js` | Toda la lógica (Firebase, tablero, Excel) |
| `firebase-config.js` | **Tus claves de Firebase** (edítalo) |
| `firestore.rules` | Reglas de la base de datos |
| `storage.rules` | Reglas del almacenamiento de fotos |
