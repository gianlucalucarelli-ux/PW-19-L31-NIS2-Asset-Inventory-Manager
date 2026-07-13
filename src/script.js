// =========================================================================
// FILE: src/script.js (BUILD DEFINITIVA - ALLINEATA A CSS E HTML)
// =========================================================================

(function () {
    // 1. Configurazione Client Supabase
    const SUPABASE_URL = "https://jacyruehgxjzxufzfoly.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphY3lydWVoZ3hqenh1Znpmb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MjY3NTEsImV4cCI6MjA5MzQwMjc1MX0.L7WiMfnil2hkso-YrdQE5UXH28Q-XwNLEacv989UKxM";

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // =========================================================================
    // INIZIALIZZAZIONE IMMEDIATA TEMA (Evita flash bianco/nero)
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
        
        // Mappatura bottoni (ID reali dal tuo HTML)
        const themeToggleBtn = document.getElementById('theme-toggle'); 
        const infoNavLink = document.querySelector('a[href="#info-section"]');

        // =========================================================================
        // LOGICA UI (Tema e Info)
        // =========================================================================
        
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                const root = document.documentElement;
                const newTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
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
                        inizializzaMFA();
                    } else {
                        mostraDashboard();
                    }
                } catch (err) { console.error(err); }
            });
        }

        function mostraDashboard() {
            if (authContainer) authContainer.style.display = 'none';
            if (dashboardContainer) dashboardContainer.style.display = 'block';
            if (navMenuLinks) navMenuLinks.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'block';
            caricaAsset();
        }

        async function caricaAsset() {
            if (!assetTableBody) return;
            const { data, error } = await supabase.from('asset').select('*');
            if (error) { assetTableBody.innerHTML = `<tr><td colspan="5">Errore caricamento.</td></tr>`; return; }
            assetTableBody.innerHTML = data.map(a => `
                <tr>
                    <td><strong>${a.id}</strong></td>
                    <td>${a.nome}</td>
                    <td>${a.categoria || 'N/D'}</td>
                    <td><span class="risk-badge ${a.classificazione_criticita === 'Critica' ? 'risk-high' : 'risk-none'}">${a.classificazione_criticita}</span></td>
                    <td>Erogazione Servizi</td>
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