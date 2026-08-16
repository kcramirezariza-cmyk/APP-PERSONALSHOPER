# 🔒 Activar HTTPS en armadiusa.store (quitar el "no seguro")

**Estado actual (verificado):**
- ✅ DNS correcto: `armadiusa.store` apunta a las IPs de GitHub y `www` también.
- ✅ El sitio ya carga por HTTP.
- ❌ Falta el **certificado HTTPS** (por eso el navegador marca "no seguro").

Solo falta que GitHub **emita el certificado** y **forzar HTTPS**. Todo se hace en la
web de GitHub (no toca el código).

---

## Pasos

### 1. Forzar la emisión del certificado
1. Entra a tu repo en GitHub → **Settings** → **Pages**.
2. En **Custom domain** debe decir `armadiusa.store`.
3. Si ves un aviso de certificado (o no aparece la casilla de HTTPS): **borra** el
   dominio del campo, dale **Save**, espera ~1 minuto, vuelve a escribir
   `armadiusa.store` y **Save** otra vez. Esto reinicia la verificación y le pide
   a GitHub un certificado nuevo.
4. Aparecerá **"DNS check successful"** ✓.

### 2. Esperar el certificado
- GitHub emite un certificado (Let's Encrypt) automáticamente.
- Suele tardar de **unos minutos hasta 24 horas**. Mientras tanto seguirá "no seguro".
- Sabrás que está listo cuando en **Settings → Pages** se **habilite** la casilla
  **"Enforce HTTPS"**.

### 3. Activar "Enforce HTTPS"
- Cuando la casilla **"Enforce HTTPS"** deje de estar gris, **márcala**.
- Desde ese momento el sitio abre con **candado seguro** y redirige todo a HTTPS.

### 4. Autorizar el dominio en Firebase (para que funcione el login)
1. Entra a **Firebase → Authentication → Settings → Dominios autorizados**.
2. **Agregar dominio**: `armadiusa.store`
3. **Agregar dominio**: `www.armadiusa.store`

> Si no haces esto, al abrir por el dominio nuevo el login podría fallar.

---

## Si después de 24 h sigue "no seguro"
- Repite el paso 1 (borrar y volver a poner el dominio) — a veces se queda pegado.
- Verifica que **no** haya registros DNS viejos en tu proveedor que estorben
  (por ejemplo, un registro A o un "parking" del dominio distinto a las IPs de GitHub:
  185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153).
- Asegúrate de escribir la dirección como **https://armadiusa.store**.
