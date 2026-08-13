// ============================================================
//  CONFIGURACIÓN DE FIREBASE
// ============================================================
//  Pega aquí la configuración de TU proyecto Firebase.
//  La consigues en: Consola Firebase > Configuración del proyecto
//  (icono engranaje) > "Tus apps" > icono </> (Web) > firebaseConfig
//
//  Estas claves NO son secretas: se pueden publicar en GitHub.
//  La seguridad real la dan el LOGIN y las REGLAS de Firestore.
// ============================================================

const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  storageBucket: "TU-PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

// No modifiques nada debajo de esta línea.
window.__FIREBASE_CONFIG__ = firebaseConfig;
