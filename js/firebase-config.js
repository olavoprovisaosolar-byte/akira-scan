import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CONFIG_PADRAO = {
    apiKey: "AIzaSyCgcStwtNbm3qtlyJvivZRcFOf_uCDaT7U",
    authDomain: "akirascan.firebaseapp.com",
    projectId: "akirascan",
    storageBucket: "akirascan.firebasestorage.app",
    messagingSenderId: "770267184753",
    appId: "1:770267184753:web:e018855052365f79c865d0",
    measurementId: "G-CYWSTE6LM2"
};

const CHAVE_LOCAL = "akirascan_firebase_config";

function configValida(config) {
    return config &&
        config.apiKey &&
        !config.apiKey.includes("COLA_AQUI") &&
        config.projectId &&
        config.projectId !== "O_TEU_PROJETO";
}

export function obterConfigFirebase() {
    try {
        const salvo = localStorage.getItem(CHAVE_LOCAL);
        if (salvo) {
            const parsed = JSON.parse(salvo);
            if (configValida(parsed)) return parsed;
        }
    } catch {
        // ignora JSON inválido
    }
    return CONFIG_PADRAO;
}

export function guardarConfigFirebase(config) {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(config));
}

export function firebaseConfigurado() {
    return configValida(obterConfigFirebase());
}

const firebaseConfig = obterConfigFirebase();

let app = null;
let auth = null;
let db = null;
let firebasePronto = false;

if (firebaseConfigurado()) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        firebasePronto = true;
    } catch (error) {
        console.error("Erro ao iniciar Firebase:", error);
    }
}

export function firebaseAtivo() {
    return firebasePronto && auth !== null;
}

export { auth, db, firebaseConfig };
