// =========================================================================
// FILE: src/script.js
// DESCRIZIONE: Engine SPA per NIS2 Asset Manager (Autenticazione & Caricamento)
// RIFERIMENTO ARCHITETTURALE: Tesi L31 - PW-19-L31-NIS2-Asset-Inventory-Manager
// =========================================================================

(function () {
    // 1. Configurazione Client Supabase (Endpoint API & Chiave Pubblica)
    // NOTA: Assicurati che queste due stringhe contengano i valori reali del tuo progetto
    const SUPABASE_URL = "https://jacyruehgxjzxufzfoly.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphY3lydWVoZ3hqenh1Znpmb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjY3NTEsImV4cCI6MjA5MzQwMjc1MX0.L7WiMfnil2hkso-YrdQE5UXH28Q-XwNLEacv989UKxM";

    // Inizializzazione protetta tramite window per prevenire SyntaxError di ridichiarazione globale
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 2. Mappatura Elementi del DOM
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

    // 3. Event Listener: Form di Autenticazione Primaria (AAL1)
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authError.textContent = ""; // Reset buffer messaggi di errore
        
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;

        try {
            // Esecuzione chiamata di login standard (Email/Password)
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
                // Transizione visiva alla maschera TOTP per iniezione secondo fattore
                loginView.style.display = 'none';
                mfaView.style.display = 'block';
                document.getElementById('mfa-desc').textContent = "Inserisci il codice temporaneo generato sul tuo dispositivo per elevare la sessione a livello Avanzato (AAL2).";
                inizializzaVerificaMFA();
            } else {
                mostraDashboardApplicativa();
            }

        } catch (err) {
            console.error("Errore imprevisto durante il login:", err);
        }
    });

    /**
     * Gestore del secondo fattore di autenticazione (TOTP) per profili amministrativi
     */
    function inizializzaVerificaMFA() {
        const verifyBtn = document.getElementById('mfa-verify-btn');
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
        authContainer.style.display = 'none';
        authError.textContent = "";
        dashboardContainer.style.display = 'block';
        infoContainer.style.display = 'block';
        navMenuLinks.style.display = 'flex';
        logoutBtn.style.display = 'block';
        
        caricaAssetDallInventario();
    }

    /**
     * Interrogazione API del backend PostgreSQL con policy RLS attive
     */
    async function caricaAssetDallInventario() {
        try {
            assetTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Caricamento record in corso...</td></tr>`;
            
            // FIX: Query pulita e lineare senza ridondanze sintattiche
            const { data, error } = await supabase.from('asset').select('*');

            if (error) {
                assetTableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Errore RLS: Accesso Negato. ${error.message}</td></tr>`;
                return;
            }

            if (!data || data.length === 0) {
                assetTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nessun asset censito nell'inventario attivo.</td></tr>`;
                return;
            }

            // Rendering dinamico sicuro allineato allo schema 3NF sanitario
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

    // Gestione del ciclo di chiusura sessione (Logout)
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });
})();