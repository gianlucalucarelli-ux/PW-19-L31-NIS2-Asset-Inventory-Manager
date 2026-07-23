// ===============================================================================================================
// FILE: src/main.js
// DESCRIZIONE: Avvio dell'applicazione, sincronizzazione della sessione e collegamento degli eventi principali.
// ===============================================================================================================

import {
    initTheme,
    toggleTheme,
    switchView,
    showSignedOutInterface,
    showMfaInterface,
    showAuthenticatedInterface,
    setAuthBusy,
    setAuthError,
    loadAndRenderTable
} from './ui.js?v=2';
import {
    signIn,
    getCurrentSession,
    resolveAccessState,
    verifyOTP,
    observeAuthState,
    signOut
} from './auth.js';
import { fetchAssets, insertAsset, updateAsset, bulkInsertAssets } from './database.js';
import { exportToExcel, parseExcelFile } from './importExport.js';

initTheme();

let activeSession = null;
let activeAccessState = null;
let lastAuthorizedSignature = null;
let accessSyncSequence = 0;

/**
 * Applica all'interfaccia lo stato reale della sessione Supabase.
 *
 * Ogni percorso di accesso, compreso il ripristino della sessione dopo un
 * aggiornamento della pagina, passa da questa funzione prima di caricare dati RLS.
 */
async function synchronizeApplicationAccess(session, options = {}) {
    const { forceDataReload = false } = options;
    const currentSequence = ++accessSyncSequence;

    if (!session) {
        activeSession = null;
        activeAccessState = null;
        lastAuthorizedSignature = null;

        // Azzera ogni stato temporaneo del wizard quando la sessione viene chiusa.
        document.dispatchEvent(new CustomEvent('incident:wizard:reset'));

        showSignedOutInterface();
        return;
    }

    try {
        const accessState = await resolveAccessState(session);

        // Una risposta più vecchia non deve sovrascrivere uno stato autenticativo più recente.
        if (currentSequence !== accessSyncSequence) return;

        if (accessState.status === 'mfa-required') {
            activeSession = session;
            activeAccessState = accessState;
            showMfaInterface(session, accessState);
            return;
        }

        if (accessState.status === 'blocked') {
            await signOut();
            showSignedOutInterface();
            setAuthError(accessState.message || 'Accesso non autorizzato.');
            return;
        }

        if (accessState.status !== 'authorized') {
            showSignedOutInterface();
            return;
        }

        activeSession = session;
        activeAccessState = accessState;

        const signature = [
            session.user.id,
            accessState.accessType,
            accessState.currentLevel
        ].join(':');

        const loadInitialData = forceDataReload || signature !== lastAuthorizedSignature;
        lastAuthorizedSignature = signature;

        showAuthenticatedInterface(session, accessState, { loadInitialData });
        setAuthError('');
    } catch (error) {
        console.error('Errore durante la sincronizzazione dell’accesso:', error);
        activeSession = null;
        activeAccessState = null;
        lastAuthorizedSignature = null;
        showSignedOutInterface();
        setAuthError('Impossibile verificare la sessione. Riprova tra qualche istante.');
    }
}

/**
 * Termina in modo controllato la sessione corrente e ripristina la schermata di accesso.
 */
async function closeCurrentSession() {
    try {
        await signOut();
    } catch (error) {
        console.error('Errore durante il logout:', error);
        setAuthError('Non è stato possibile completare la disconnessione.');
    } finally {
        await synchronizeApplicationAccess(null);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('login-form');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const dashboardNavLink = document.querySelector('a[href="#dashboard-section"]');
    const infoNavLink = document.querySelector('a[href="#info-section"]');
    const mfaVerifyBtn = document.getElementById('mfa-verify-btn');
    const mfaCancelBtn = document.getElementById('mfa-cancel-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // Compatibilità temporanea con i pulsanti inline. Verrà eliminata nella Fase A3.
    window.switchView = switchView;

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    if (dashboardNavLink) {
        dashboardNavLink.addEventListener('click', (event) => {
            event.preventDefault();

            if (!activeSession || activeAccessState?.status !== 'authorized') {
                setAuthError('Effettua l’accesso per aprire la Dashboard.');
                return;
            }

            showAuthenticatedInterface(activeSession, activeAccessState, { loadInitialData: false });
            switchView('inventory');

            document.querySelectorAll('.nav-link').forEach((link) => link.classList.remove('active'));
            dashboardNavLink.classList.add('active');
        });
    }

    if (infoNavLink) {
        infoNavLink.addEventListener('click', (event) => {
            event.preventDefault();
            const infoContainer = document.getElementById('info-container');
            if (infoContainer) {
                infoContainer.classList.toggle('is-hidden');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            setAuthError('');
            setAuthBusy('login', true);

            const email = document.getElementById('auth-email')?.value ?? '';
            const password = document.getElementById('auth-password')?.value ?? '';

            try {
                const { session } = await signIn(email, password);
                await synchronizeApplicationAccess(session, { forceDataReload: true });
            } catch (error) {
                console.error('Errore di autenticazione:', error);
                setAuthError('E-mail o password non valide. Verifica i dati e riprova.');
            } finally {
                setAuthBusy('login', false);
            }
        });
    }

    if (mfaVerifyBtn) {
        mfaVerifyBtn.addEventListener('click', async () => {
            const code = document.getElementById('mfa-code')?.value ?? '';
            setAuthError('');
            setAuthBusy('mfa', true);

            try {
                await verifyOTP(code);
                const session = await getCurrentSession();
                await synchronizeApplicationAccess(session, { forceDataReload: true });
            } catch (error) {
                console.error('Errore durante la verifica MFA:', error);
                setAuthError(error.message || 'Il codice MFA non è valido o è scaduto.');
            } finally {
                setAuthBusy('mfa', false);
            }
        });
    }

    if (mfaCancelBtn) {
        mfaCancelBtn.addEventListener('click', closeCurrentSession);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', closeCurrentSession);
    }

    // L'osservatore mantiene l'interfaccia allineata anche dopo refresh del token,
    // completamento MFA o disconnessione avvenuta in un'altra scheda.
    observeAuthState((event, session) => {
        if (event === 'SIGNED_OUT') {
            synchronizeApplicationAccess(null);
            return;
        }

        if ([
            'INITIAL_SESSION',
            'SIGNED_IN',
            'TOKEN_REFRESHED',
            'USER_UPDATED',
            'MFA_CHALLENGE_VERIFIED'
        ].includes(event)) {
            synchronizeApplicationAccess(session);
        }
    });

    try {
        const session = await getCurrentSession();
        await synchronizeApplicationAccess(session);
    } catch (error) {
        console.error('Errore nel recupero della sessione iniziale:', error);
        showSignedOutInterface();
        setAuthError('Impossibile recuperare la sessione salvata. Effettua nuovamente l’accesso.');
    }

    // =========================================================================
    // MODULI OPERATIVI ESISTENTI
    // =========================================================================

    const formAsset = document.getElementById('asset-form');
    if (formAsset) {
        formAsset.addEventListener('submit', async (event) => {
            event.preventDefault();
            const id = document.getElementById('asset-id').value;
            const nome = document.getElementById('asset-nome').value.trim();
            const versione = document.getElementById('asset-versione').value.trim();
            const criticita = document.getElementById('asset-criticita').value;

            if (!nome) {
                alert('Attenzione: il nome dell’asset è un campo obbligatorio.');
                return;
            }

            const payload = { nome, versione, criticita };

            try {
                if (id) {
                    await updateAsset(id, payload);
                    alert('Configurazione asset aggiornata.');
                } else {
                    await insertAsset(payload);
                    alert('Nuovo asset registrato.');
                }

                switchView('inventory');
                loadAndRenderTable();
            } catch (error) {
                console.error('Errore database:', error);
                alert(`Errore operativo: ${error.message}`);
            }
        });
    }

    const btnExportXls = document.getElementById('btn-export-xls');
    if (btnExportXls) {
        btnExportXls.addEventListener('click', async () => {
            try {
                const data = await fetchAssets();
                exportToExcel(data);
            } catch (error) {
                console.error('Errore durante l’esportazione:', error);
                alert('Errore durante l’esportazione dei dati.');
            }
        });
    }

    const btnTriggerImport = document.getElementById('btn-trigger-import');
    const fileInput = document.getElementById('import-xls-input');

    if (btnTriggerImport && fileInput) {
        btnTriggerImport.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const parsedData = await parseExcelFile(file);
                const confirmed = confirm(`Procedere con l’importazione di ${parsedData.length} asset?`);

                if (confirmed) {
                    await bulkInsertAssets(parsedData);
                    loadAndRenderTable();
                }
            } catch (error) {
                console.error('Errore durante l’importazione:', error);
                alert('Anomalia durante l’analisi del file.');
            } finally {
                fileInput.value = '';
            }
        });
    }
});
