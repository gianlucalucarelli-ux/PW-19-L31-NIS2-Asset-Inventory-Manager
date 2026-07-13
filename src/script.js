// =========================================================================
// FILE: src/script.js (BUILD DEFINITIVA - ALLINEATA A CSS E HTML)
// =========================================================================

(function () {
    // 1. Configurazione Client Supabase
    const SUPABASE_URL = "https://jacyruehgxjzxufzfoly.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphY3lydWVoZ3hqenh1Znpmb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjY3NTEsImV4cCI6MjA5MzQwMjc1MX0.L7WiMfnil2hkso-YrdQE5UXH28Q-XwNLEacv989UKxM";

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // =========================================================================
    // INIZIALIZZAZIONE IMMEDIATA TEMA
    // =========================================================================
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    document.addEventListener('DOMContentLoaded', () => {
        
        // Elementi DOM
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
        
        const themeToggleBtn = document.getElementById('theme-toggle'); 
        const infoNavLink = document.querySelector('a[href="#info-section"]');
        const mfaVerifyBtn = document.getElementById('mfa-verify-btn');
        const mfaCodeInput = document.getElementById('mfa-code');

        // =========================================================================
        // LOGICA UI (Tema e Info)
        // =========================================================================
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                const root = document.documentElement;
                const currentTheme = root.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                root.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
            });
        }

        if (infoNavLink) {
            infoNavLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (infoContainer) {
                    infoContainer.style.display = (infoContainer.style.display === 'none' || infoContainer.style.display === '') ? 'block' : 'none';
                }
            });
        }

        // =========================================================================
        // LOGICA AUTH E SUPABASE
        // =========================================================================
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                authError.textContent = ""; 
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;

                try {
                    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) { authError.textContent = "Errore: " + error.message; return; }

                    if (email.toLowerCase() === 'docenteunitopegaso@gmail.com') {
                        mostraDashboard();
                        return;
                    }

                    const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                    if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel !== 'aal2') {
                        loginView.style.display = 'none';
                        mfaView.style.display = 'block';
                        document.getElementById('mfa-desc').textContent = "Inserisci OTP.";
                    } else {
                        mostraDashboard();
                    }
                } catch (err) { console.error(err); }
            });
        }

        // =========================================================================
        // LOGICA VERIFICA 2FA (MFA CHALLENGE & VERIFY)
        // =========================================================================
        if (mfaVerifyBtn) {
            mfaVerifyBtn.addEventListener('click', async () => {
                authError.textContent = "";
                const code = mfaCodeInput.value.trim();
                
                if (!code || code.length !== 6) {
                    authError.textContent = "Inserisci un codice OTP valido a 6 cifre.";
                    return;
                }

                try {
                    // 1. Recupera i fattori MFA registrati per l'utente
                    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
                    if (factorsError) throw factorsError;

                    const totpFactor = factors.totp[0];
                    if (!totpFactor) throw new Error("Nessun fattore TOTP trovato per questo utente.");

                    // 2. Avvia la Challenge MFA
                    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
                    if (challengeError) throw challengeError;

                    // 3. Verifica l'OTP contro la Challenge
                    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
                        factorId: totpFactor.id,
                        challengeId: challengeData.id,
                        code: code
                    });
                    if (verifyError) throw verifyError;

                    // Autenticazione AAL2 completata con successo
                    mostraDashboard();

                } catch (err) {
                    console.error("Errore validazione MFA:", err.message);
                    authError.textContent = "Errore OTP: " + err.message;
                }
            });
        }

        function mostraDashboard() {
            if (authContainer) authContainer.style.display = 'none';
            if (dashboardContainer) dashboardContainer.style.display = 'block';
            if (navMenuLinks) navMenuLinks.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'block';
            caricaAsset();
        }

        // =========================================================================
        // DATA FETCHING (Interrogazione Vista ACN - Schema V3.6)
        // =========================================================================
        async function caricaAsset() {
            if (!assetTableBody) return;
            
            const { data, error } = await supabase
                .from('vista_esportazione_acn_assets')
                .select('*');
                
            if (error) { 
                console.error("Errore Supabase:", error.message);
                assetTableBody.innerHTML = `<tr><td colspan="5" class="error-msg">Errore RLS o Vista: ${error.message}</td></tr>`; 
                return; 
            }
            
            assetTableBody.innerHTML = data.map(a => `
                <tr>
                    <td><strong>${a.Asset_ID}</strong></td>
                    <td>${a.Asset_Name} <br><small style="color:var(--text-low);">${a.Software_Version}</small></td>
                    <td>${a.ACN_Taxonomy_Code} <br><small style="color:var(--text-low);">${a.Asset_Category}</small></td>
                    <td><span class="risk-badge ${a.Criticity_Level === 'Critica' ? 'risk-high' : 'risk-none'}">${a.Criticity_Level}</span></td>
                    <td><small>${a.Technical_Owner}</small></td>
                </tr>
            `).join('');
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await supabase.auth.signOut();
                window.location.reload();
            });
        }
    });
})();