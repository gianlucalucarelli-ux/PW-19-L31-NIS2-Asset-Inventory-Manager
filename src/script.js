// =========================================================================
// FILE: src/script.js
// DESCRIZIONE: Engine SPA per NIS2 Asset Manager (Autenticazione & Caricamento)
// FIX: Isolamento dello scope (IIFE) per prevenire collisioni con il CDN
// =========================================================================

(function () {
    // 1. Configurazione Client Supabase
    // IMPORTANTE: Sostituisci queste stringhe con l'URL e la chiave ANON reali del tuo progetto Supabase
    const SUPABASE_URL = "https://tuo-progetto-id.supabase.co";
    const SUPABASE_ANON_KEY = "tuo-anon-key-configurato";

    // Istanziazione protetta tramite l'oggetto globale window per evitare eccezioni di ridichiarazione
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Elementi del DOM intercettati nativamente
    const loginForm = document.getElementById('login-form');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const authContainer = document.getElementById('auth-container');
    const authError = document.getElementById('auth-error');
    const dashboardContainer = document.getElementById('dashboard-container');
    const infoContainer = document.getElementById('info-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');
    const presentationHeader = document.getElementById('presentation-header');
    const assetTableBody = document.getElementById('asset-table-body');

    // Listener per il Form di Login Primario (Email/Password)
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authError.textContent = ""; // Reset messaggi di errore
        
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        try {
            // Autenticazione di primo livello (AAL1)
            const { data: authData, error: authErrorResult } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (authErrorResult) {
                authError.textContent = "Errore: " + authErrorResult.message;
                return;
            }

            console.log("Livello di autenticazione AAL1 convalidato.");

            // =========================================================================
            // DEVIAZIONE CONDIZIONALE: Bypass controllato per profilo d'ispezione Docente
            // =========================================================================
            if (email.toLowerCase() === 'docenteunitopegaso@gmail.com') {
                console.log("Rilevata utenza docente. Attivazione deroga e sblocco interfaccia.");
                mostraDashboardApplicativa();
                return;
            }

            // =========================================================================
            // FLUSSO DI HARDENING: Verifica MFA obbligatoria per utenza amministratore
            // =========================================================================
            const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

            if (mfaError) {
                authError.textContent = "Errore nel controllo di sicurezza MFA.";
                return;
            }

            if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel !== 'aal2') {
                // Transizione interna alla vista di verifica del token TOTP
                loginView.style.display = 'none';
                mfaView.style.display = 'block';
                document.getElementById('mfa-desc').textContent = "Inserisci il codice temporaneo generato sul tuo dispositivo per elevare la sessione a livello Avanzato (AAL2).";
                
                inizializzaVerificaMFA();
            } else {
                // Se l'utente non ha la 2FA configurata, accede direttamente (Stato Staging)
                mostraDashboardApplicativa();
            }

        } catch (err) {
            console.error("Errore imprevisto durante il login:", err);
        }
    });

    /**
     * Gestore del secondo fattore di autenticazione (TOTP) per utente amministratore
     */
    function inizializzaVerificaMFA() {
        const verifyBtn = document.getElementById('mfa-verify-btn');
        
        // Rimuove eventuali listener precedenti per evitare esecuzioni doppie
        const newVerifyBtn = verifyBtn.cloneNode(true);
        verifyBtn.parentNode.replaceChild(newVerifyBtn, verifyBtn);

        newVerifyBtn.addEventListener('click', async () => {
            const code = document.getElementById('mfa-code').value;
            if (code.length !== 6) {
                authError.textContent = "Il codice OTP deve essere di 6 cifre.";
                return;
            }

            const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
            if (factorsError || !factors.totp || factors.totp.length === 0) {
                authError.textContent = "Nessun dispositivo MFA associato a questo account.";
                return;
            }

            const factorId = factors.totp[0].id;

            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                factorId: factorId,
                code: code
            });

            if (verifyError) {
                authError.textContent = "Codice OTP non valido o scaduto.";
                return;
            }

            console.log("Assurance Level AAL2 verificato con successo.");
            mostraDashboardApplicativa();
        });
    }

    /**
     * Funzione centralizzata per lo switch dell'interfaccia utente (UI Transition)
     */
    function mostraDashboardApplicativa() {
        // Nasconde completamente il blocco di autenticazione
        authContainer.style.display = 'none';
        authError.textContent = "";
        
        // Mostra i componenti operativi dell'inventario e della navigazione
        dashboardContainer.style.display = 'block';
        infoContainer.style.display = 'block';
        navMenuLinks.style.display = 'flex';
        logoutBtn.style.display = 'block';
        
        // Invocazione del caricamento dei record dal database
        caricaAssetDallInventario();
    }

    /**
     * Interrogazione API del backend PostgreSQL con policy RLS attive
     */
    async function caricaAssetDallInventario() {
        try {
            assetTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Caricamento record cifrati in corso...</td></tr>`;
            
            // Esecuzione query sulla tabella asset (sottoposta a RLS)
            const { data, error } = await supabase
                = await supabase.from('asset').select('*');

            if (error) {
                assetTableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Errore RLS: Accesso Negato. ${error.message}</td></tr>`;
                return;
            }

            if (!data || data.length === 0) {
                assetTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nessun asset censito nell'inventario attivo.</td></tr>`;
                return;
            }

            // Rendering dinamico dei record nella tabella HTML
            assetTableBody.innerHTML = data.map(asset => `
                <tr>
                    <td><strong>${asset.id}</strong></td>
                    <td>${asset.nome}</td>
                    <td><span class="badge-version">${asset.categoria || 'N/D'}</span></td>
                    <td><span class="criticita-${asset.classificazione_criticita.toLowerCase()}">${asset.classificazione_criticita}</span></td>
                    <td>Erogazione Servizi Critici</td>
                </tr>
            `).join('');

        } catch (err) {
            console.error("Errore nel caricamento dei dati:", err);
        }
    }

    // Gestione del Logout
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });
})();