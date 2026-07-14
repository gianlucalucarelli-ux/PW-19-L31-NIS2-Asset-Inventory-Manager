// ===============================================================================================================
// FILE: src/main.js Punto d'ingresso dell'applicazione. Orchestrazione degli eventi e mappatura delle API globali
// ===============================================================================================================
import { initTheme, toggleTheme, switchView, mostraDashboardInterfaccia, loadAndRenderTable } from './ui.js';
import { signIn, getMFAStatus, verifyOTP, signOut } from './auth.js';
import { fetchAssets, insertAsset, updateAsset, bulkInsertAssets } from './database.js';
import { exportToExcel, parseExcelFile } from './importExport.js';

console.log("Sistema modulare ES6 caricato correttamente!");

// Esecuzione immediata per prevenire sfarfallii visivi
initTheme();

document.addEventListener('DOMContentLoaded', () => {
// Riferimenti DOM
    const loginForm = document.getElementById('login-form');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const authError = document.getElementById('auth-error');
    const themeToggleBtn = document.getElementById('theme-toggle'); 
    const infoNavLink = document.querySelector('a[href="#info-section"]');
    const mfaVerifyBtn = document.getElementById('mfa-verify-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Mappatura globale per mantenere la compatibilità con l'HTML esistente
    window.switchView = switchView;

    // Event Listener per il cambio tema
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
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
    // MODULI OPERATIVI: CRUD ASSET & IMPORT/EXPORT (NIS2 Compliance)
    // =========================================================================

    // 1. Gestione Sottomissione Form (Nuovo Asset / Modifica)
    const formAsset = document.getElementById('asset-form');
    if (formAsset) {
        formAsset.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('asset-id').value;
            const nome = document.getElementById('asset-nome').value.trim();
            const versione = document.getElementById('asset-versione').value.trim();
            const criticita = document.getElementById('asset-criticita').value;

            if (!nome) {
                alert("Attenzione: Il nome dell'asset è un campo obbligatorio per la catalogazione.");
                return;
            }

            const payload = { nome, versione, criticita };

            try {
                if (id) {
                    await updateAsset(id, payload);
                    alert("Configurazione asset aggiornata con successo.");
                } else {
                    await insertAsset(payload);
                    alert("Nuovo asset registrato a sistema.");
                }
                
                window.switchView('inventory');
                
                if (typeof loadAndRenderTable === 'function') {
                    loadAndRenderTable();
                }
            } catch (err) {
                console.error("Errore Transazione DB:", err);
                alert("Errore operativo durante il salvataggio: " + err.message);
            }
        });
    }

    // 2. Esportazione Dati (XLSX)
    const btnExportXls = document.getElementById('btn-export-xls');
    if (btnExportXls) {
        btnExportXls.addEventListener('click', async () => {
            try {
                const data = await fetchAssets();
                exportToExcel(data);
            } catch (err) {
                console.error("Errore Export:", err);
                alert("Impossibile esportare i dati: errore di query al database.");
            }
        });
    }

    // 3. Importazione Dati Massiva (XLSX/CSV)
    const btnTriggerImport = document.getElementById('btn-trigger-import');
    const fileInput = document.getElementById('import-xls-input');

    if (btnTriggerImport && fileInput) {
        // Simula il click nativo sull'input hidden
        btnTriggerImport.addEventListener('click', () => fileInput.click());

        // Intercetta il caricamento del file
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const parsedData = await parseExcelFile(file);

                if (!parsedData || parsedData.length === 0) {
                    alert("Errore: Il file non contiene righe valide o le intestazioni non corrispondono.");
                    return;
                }

                const conferma = confirm(`Rilevati ${parsedData.length} asset conformi. Procedere con la transazione Bulk Insert a database?`);
                if (conferma) {
                    await bulkInsertAssets(parsedData);
                    alert("Importazione massiva conclusa positivamente.");
                    
                    if (typeof loadAndRenderTable === 'function') {
                        loadAndRenderTable();
                    }
                }
            } catch (err) {
                console.error("Errore Parsing XLS:", err);
                alert("Anomalia durante l'analisi del file. Verificare integrità e formato.");
            } finally {
                fileInput.value = ''; // Pulisce il buffer del file per consentire re-importazioni
            }
        });
    }
});