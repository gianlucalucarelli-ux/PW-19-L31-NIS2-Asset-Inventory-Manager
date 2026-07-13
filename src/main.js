// ===============================================================================================================
// FILE: src/main.js Punto d'ingresso dell'applicazione. Orchestrazione degli eventi e mappatura delle API globali
// ===============================================================================================================
import { initTheme, toggleTheme, switchView, mostraDashboardInterfaccia } from './ui.js';
import { signIn, getMFAStatus, verifyOTP, signOut } from './auth.js';
import { exportToCSV } from './export.js';
import { fetchAssets } from './database.js';
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
    window.esportaDatiACN = async () => {
        try {
            const data = await fetchAssets();
            exportToCSV(data);
        } catch (err) {
            alert("Errore durante l'esportazione: " + err.message);
        }
    };

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
});