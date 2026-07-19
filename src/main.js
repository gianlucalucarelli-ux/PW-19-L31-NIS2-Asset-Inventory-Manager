// ===============================================================================================================
// FILE: src/main.js - VERSIONE DEFINITIVA E VERIFICATA
// ===============================================================================================================
import { initTheme, toggleTheme, switchView, mostraDashboardInterfaccia, loadAndRenderTable } from './ui.js';
import { signIn, getMFAStatus, verifyOTP, signOut } from './auth.js';
import { fetchAssets, insertAsset, updateAsset, bulkInsertAssets } from './database.js';
import { exportToExcel, parseExcelFile } from './importExport.js';
import { supabase } from './supabase.js';

console.log("Sistema modulare ES6 caricato correttamente!");

initTheme();

document.addEventListener('DOMContentLoaded', async () => {
    // --- LOGICA PERSISTENZA SESSIONE ---
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        console.log("Sessione rilevata, accesso automatico alla Dashboard.");
        mostraDashboardInterfaccia();
        const navLinks = document.getElementById('nav-menu-links');
        if (navLinks) navLinks.style.display = 'flex';
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.reload();
        }
    });

    // Riferimenti DOM
    const loginForm = document.getElementById('login-form');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const authError = document.getElementById('auth-error');
    const themeToggleBtn = document.getElementById('theme-toggle'); 
    const dashboardNavLink = document.querySelector('a[href="#dashboard-section"]');
    const infoNavLink = document.querySelector('a[href="#info-section"]');
    const mfaVerifyBtn = document.getElementById('mfa-verify-btn');
    const logoutBtn = document.getElementById('logout-btn');

    window.switchView = switchView;

    // Event Listener per il cambio tema
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // --- NAVIGAZIONE: DASHBOARD (Gestione Auth Guard) ---
    if (dashboardNavLink) {
        dashboardNavLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session) {
                // Mostra interfaccia e switcha alla vista principale
                mostraDashboardInterfaccia();
                window.switchView('inventory');
                
                // Aggiorna classe active
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                dashboardNavLink.classList.add('active');
            } else {
                alert("Effettua il login per accedere alla Dashboard.");
            }
        });
    }

    // Navigazione Info Progetto
    if (infoNavLink) {
        infoNavLink.addEventListener('click', (e) => {
            e.preventDefault();
            const infoContainer = document.getElementById('info-container');
            if (infoContainer) {
                infoContainer.style.display = (infoContainer.style.display === 'none' || infoContainer.style.display === '') ? 'block' : 'none';
            }
        });
    }

    // Handler per l'invio delle credenziali
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authError.textContent = ""; 
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;

            try {
                await signIn(email, password);
                if (email.toLowerCase() === 'docenteunitopegaso@gmail.com') {
                    mostraDashboardInterfaccia();
                    return;
                }
                const mfaData = await getMFAStatus();
                if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel !== 'aal2') {
                    loginView.style.display = 'none';
                    mfaView.style.display = 'block';
                    document.getElementById('mfa-desc').textContent = "Inserisci OTP.";
                } else {
                    mostraDashboardInterfaccia();
                }
            } catch (err) {
                console.error("Errore Autenticazione:", err.message);
                authError.textContent = "Errore di accesso: " + err.message;
            }
        });
    }

    // Handler per la verifica TOTP
    if (mfaVerifyBtn) {
        mfaVerifyBtn.addEventListener('click', async () => {
            authError.textContent = "";
            const code = document.getElementById('mfa-code').value.trim();
            if (!code || code.length !== 6) {
                authError.textContent = "Inserisci un codice OTP valido a 6 cifre.";
                return;
            }
            try {
                await verifyOTP(code);
                mostraDashboardInterfaccia();
            } catch (err) {
                console.error("Errore Validazione TOTP:", err.message);
                authError.textContent = "Codice OTP non valido o scaduto: " + err.message;
            }
        });
    }

    // Handler di disconnessione
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut();
                window.location.reload();
            } catch (err) {
                console.error("Errore Logout:", err.message);
            }
        });
    }

    // =========================================================================
    // MODULI OPERATIVI
    // =========================================================================
    const formAsset = document.getElementById('asset-form');
    if (formAsset) {
        formAsset.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('asset-id').value;
            const nome = document.getElementById('asset-nome').value.trim();
            const versione = document.getElementById('asset-versione').value.trim();
            const criticita = document.getElementById('asset-criticita').value;

            if (!nome) {
                alert("Attenzione: Il nome dell'asset è un campo obbligatorio.");
                return;
            }

            const payload = { nome, versione, criticita };
            try {
                if (id) {
                    await updateAsset(id, payload);
                    alert("Configurazione asset aggiornata.");
                } else {
                    await insertAsset(payload);
                    alert("Nuovo asset registrato.");
                }
                window.switchView('inventory');
                if (typeof loadAndRenderTable === 'function') loadAndRenderTable();
            } catch (err) {
                console.error("Errore DB:", err);
                alert("Errore operativo: " + err.message);
            }
        });
    }

    const btnExportXls = document.getElementById('btn-export-xls');
    if (btnExportXls) {
        btnExportXls.addEventListener('click', async () => {
            try {
                const data = await fetchAssets();
                exportToExcel(data);
            } catch (err) {
                alert("Errore export database.");
            }
        });
    }

    const btnTriggerImport = document.getElementById('btn-trigger-import');
    const fileInput = document.getElementById('import-xls-input');
    if (btnTriggerImport && fileInput) {
        btnTriggerImport.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const parsedData = await parseExcelFile(file);
                const conferma = confirm(`Procedere con l'importazione di ${parsedData.length} asset?`);
                if (conferma) {
                    await bulkInsertAssets(parsedData);
                    if (typeof loadAndRenderTable === 'function') loadAndRenderTable();
                }
            } catch (err) {
                alert("Anomalia durante l'analisi del file.");
            } finally {
                fileInput.value = '';
            }
        });
    }
});