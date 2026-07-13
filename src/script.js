// =========================================================================
// FILE: src/script.js (BUILD 100% ALLINEATA ALL'HTML DELL'UTENTE)
// DESCRIZIONE: Engine SPA per NIS2 Asset Manager (Autenticazione & Caricamento)
// =========================================================================

(function () {
    // 1. Configurazione Client Supabase
    const SUPABASE_URL = "https://jacyruehgxjzxufzfoly.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphY3lydWVoZ3hqenh1Znpmb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjY3NTEsImV4cCI6MjA5MzQwMjc1MX0.L7WiMfnil2hkso-YrdQE5UXH28Q-XwNLEacv989UKxM";

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Esecuzione al completamento del parsing dell'HTML (Previene nodi DOM nulli)
    document.addEventListener('DOMContentLoaded', () => {
        
        // Elementi del DOM intercettati nativamente dall'HTML fornito
        const loginForm = document.getElementById('login-form');
        const loginView = document.getElementById('login-view');
        const mfaView = document.getElementById('mfa-view');
        const authContainer = document.getElementById('auth-container');
        const authError = document.getElementById('auth-error');
        const dashboardContainer = document.getElementById('dashboard-container');
        const infoContainer = document.getElementById('info-container');
        const navMenuLinks = document.getElementById('nav-menu-links');
        const logoutBtn = document.getElementById('logout-btn');
        const assetTableBody = document.getElementById('asset-table-body');
        
        // Mappatura controlli UI basata sugli ID reali del tuo index.html
        const themeToggleBtn = document.getElementById('theme-toggle'); 
        const infoNavLink = document.querySelector('a[href="#info-section"]');

        // Ripristino del tema salvato all'avvio (Persistenza nello storage)
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        }

        // Listener per il Form di Login Primario (Email/Password)
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                authError.textContent = ""; 
                
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;

                try {
                    const { data: authData, error: authErrorResult } = await supabase.auth.signInWithPassword({
                        email: email,
                        password: password,
                    });

                    if (authErrorResult) {
                        authError.textContent = "Errore: " + authErrorResult.message;
                        return;
                    }

                    console.log("Livello di autenticazione AAL1 convalidato.");

                    // Deviazione Condizionale Profilo Docente
                    if (email.toLowerCase() === 'docenteunitopegaso@gmail.com') {
                        console.log("Rilevata utenza docente. Attivazione deroga e sblocco interfaccia.");
                        mostraDashboardApplicativa();
                        return;
                    }

                    // Flusso Hardening MFA per Amministratore
                    const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

                    if (mfaError) {
                        authError.textContent = "Errore nel controllo di sicurezza MFA.";
                        return;
                    }

                    if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel !== 'aal2') {
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
        }

        function inizializzaVerificaMFA() {
            const verifyBtn = document.getElementById('mfa-verify-btn');
            if (!verifyBtn) return;
            
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

        function mostraDashboardApplicativa() {
            if (authContainer) authContainer.style.display = 'none';
            if (authError) authError.textContent = "";
            if (dashboardContainer) dashboardContainer.style.display = 'block';
            if (infoContainer) infoContainer.style.display = 'block';
            if (navMenuLinks) navMenuLinks.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'block';
            
            caricaAssetDallInventario();
        }

        async function caricaAssetDallInventario() {
            if (!assetTableBody) return;
            try {
                assetTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Caricamento record in corso...</td></tr>`;
                
                const { data, error } = await supabase.from('asset').select('*');

                if (error) {
                    assetTableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Errore RLS: Accesso Negato. ${error.message}</td></tr>`;
                    return;
                }

                if (!data || data.length === 0) {
                    assetTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nessun asset censito nell'inventario attivo.</td></tr>`;
                    return;
                }

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
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supabase.auth.signOut();
                window.location.reload();
            });
        }

        // =========================================================================
        // INTERCETTAZIONE EVENTI GRAFICI (BINDING CORRETTO SU ID TUA NAV)
        // =========================================================================
        
        // Switch chiaro/scuro su id="theme-toggle"
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const isDark = document.body.classList.contains('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }

        // Mostra/Nasconde Info Progetto intercettando il link href="#info-section"
        if (infoNavLink) {
            infoNavLink.addEventListener('click', (e) => {
                e.preventDefault(); // Impedisce il salto di ancoraggio della pagina
                if (infoContainer) {
                    infoContainer.style.display = (infoContainer.style.display === 'none' || infoContainer.style.display === '') ? 'block' : 'none';
                }
            });
        }
    });
})();