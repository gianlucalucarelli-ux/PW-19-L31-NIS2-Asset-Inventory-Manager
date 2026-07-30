// ===============================================================================================================
// FILE: src/main.js
// DESCRIZIONE: Avvio dell'applicazione, sincronizzazione della sessione e collegamento degli eventi principali.
// ===============================================================================================================

import {
    initTheme,
    toggleTheme,
    activateApplicationRoute,
    showSignedOutInterface,
    showMfaInterface,
    showAuthenticatedInterface,
    setAuthBusy,
    setAuthError,
    getFilteredInventoryExportSnapshot
} from './ui.js?build=20260730-f10';
import {
    initializeRouter,
    navigateTo,
    refreshCurrentRoute
} from './router.js?build=20260730-f10';
import {
    signIn,
    getCurrentSession,
    resolveAccessState,
    verifyOTP,
    observeAuthState,
    signOut,
    recordAccessEvent
} from './auth.js?build=20260728-q1';
import { fetchAssets, fetchAssetReferences, insertAsset, updateAsset } from './database.js?build=20260726-d2';
import { exportFilteredAssetsToExcel, downloadAssetImportTemplate, parseAssetImportFile } from './importExport.js?build=20260726-d3';
import { initI18n } from './i18n.js?build=20260730-f10';

initTheme();
initI18n();

let activeSession = null;
let activeAccessState = null;
let lastAuthorizedSignature = null;
let accessSyncSequence = 0;
let routerReady = false;
let pendingImportPreview = null;
let importCompleted = false;
let pendingAccessAuditKey = null;

const ACCESS_AUDIT_STORAGE_PREFIX = 'nis2-audit-access-session:';

/**
 * Estrae il session_id dal JWT senza conservare il token.
 */
function getSessionIdentifier(session) {
    try {
        const token = String(session?.access_token || '');
        const payloadPart = token.split('.')[1];
        if (payloadPart) {
            const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
            const payload = JSON.parse(window.atob(padded));
            if (payload?.session_id) return String(payload.session_id);
        }
    } catch (error) {
        console.warn('Identificativo sessione JWT non leggibile:', error);
    }

    return String(session?.expires_at || session?.user?.id || 'sessione');
}

/**
 * Registra una sola volta per scheda del browser l'apertura di una sessione
 * autorizzata. Copre sia il login esplicito sia una sessione gia valida
 * ripristinata all'apertura del sito.
 */
async function registerAuthorizedSessionAccess(session, accessState) {
    if (!session?.user || accessState?.status !== 'authorized') return;

    const sessionIdentifier = getSessionIdentifier(session);
    const storageKey = `${ACCESS_AUDIT_STORAGE_PREFIX}${session.user.id}:${sessionIdentifier}`;

    if (window.sessionStorage.getItem(storageKey) === 'registrato') return;
    if (pendingAccessAuditKey === storageKey) return;

    pendingAccessAuditKey = storageKey;

    try {
        const detail = accessState.accessType === 'evaluation'
            ? 'Apertura sessione autorizzata dell utenza di valutazione docente.'
            : `Apertura sessione applicativa autorizzata con livello ${String(accessState.currentLevel || 'aal1').toUpperCase()}.`;

        const auditId = await recordAccessEvent('LOGIN', detail);
        if (auditId !== null && auditId !== undefined) {
            window.sessionStorage.setItem(storageKey, 'registrato');
        }
    } finally {
        if (pendingAccessAuditKey === storageKey) pendingAccessAuditKey = null;
    }
}

/**
 * Conclude la fase di avvio soltanto dopo che la sessione iniziale è stata verificata.
 * In questo modo la pagina di accesso non appare per un istante agli utenti già autenticati.
 */
function completeInitialBoot() {
    document.documentElement.classList.remove('app-booting');

    const bootScreen = document.getElementById('app-boot-screen');
    if (bootScreen) {
        bootScreen.remove();
    }
}

/**
 * Verifica se la sessione corrente ha completato il flusso di autorizzazione.
 */
function isApplicationAuthorized() {
    return Boolean(activeSession && activeAccessState?.status === 'authorized');
}

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

        const shouldRefreshRoute = forceDataReload || signature !== lastAuthorizedSignature;
        lastAuthorizedSignature = signature;

        showAuthenticatedInterface(session, accessState);
        setAuthError('');

        // La registrazione avviene quando la sessione e realmente autorizzata.
        // In questo modo sono tracciati anche gli accessi con sessione gia valida.
        await registerAuthorizedSessionAccess(session, accessState);

        if (routerReady && shouldRefreshRoute) {
            await refreshCurrentRoute();
        }
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
        await recordAccessEvent('LOGOUT', 'Disconnessione volontaria dall’applicazione.');
        await signOut();
    } catch (error) {
        console.error('Errore durante il logout:', error);
        setAuthError('Non è stato possibile completare la disconnessione.');
    } finally {
        await synchronizeApplicationAccess(null);
        await navigateTo('dashboard', { replace: true });
    }
}

/**
 * Collega tutti i controlli dichiarativi data-route al router centrale.
 */
function initializeNavigationControls() {
    document.addEventListener('click', (event) => {
        const routeControl = event.target.closest('[data-route]');
        if (!routeControl) return;

        event.preventDefault();

        if (!isApplicationAuthorized()) {
            setAuthError('Effettua l’accesso per aprire questa sezione.');
            return;
        }

        navigateTo(routeControl.dataset.route, { force: true });
    });
}


/**
 * Traduce gli errori più comuni di PostgreSQL, PostgREST e RLS in messaggi operativi.
 */
function formattaErroreOperativo(error) {
    const code = error?.code || '';
    const message = String(error?.message || '').trim();

    if (code === '23505') {
        return 'Il codice asset è già utilizzato. Inserisci un codice univoco.';
    }
    if (code === '23502') {
        return 'Uno o più campi obbligatori non sono stati valorizzati.';
    }
    if (code === '23503') {
        return 'Categoria, organizzazione o responsabile non sono più disponibili.';
    }
    if (code === '23514') {
        return 'Uno dei valori non rispetta i vincoli previsti dal database.';
    }
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
        return 'La sessione non dispone dell’autorizzazione necessaria per completare l’operazione.';
    }
    if (code === 'PGRST116') {
        return 'Il database non ha restituito la riga attesa.';
    }

    return message || 'Errore operativo non specificato.';
}


function escapeImportHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function buildAssetExportRows(assets, references) {
    const categories = new Map((references.categorie || []).map((item) => [Number(item.id), item.nome]));
    const organizations = new Map((references.organizzazioni || []).map((item) => [Number(item.id), item.nome]));
    const responsibles = new Map((references.responsabili || []).map((item) => [Number(item.id), item]));

    return (assets || []).map((asset) => {
        const responsible = responsibles.get(Number(asset.responsabile_id));
        return {
            id: asset.id,
            codice_asset: asset.codice_asset || '',
            nome: asset.nome || '',
            categoria: categories.get(Number(asset.categoria_asset_id)) || 'N/D',
            organizzazione: organizations.get(Number(asset.organizzazione_id)) || 'N/D',
            responsabile: responsible
                ? `${responsible.nome || ''} ${responsible.cognome || ''}`.trim()
                : 'N/D',
            email_responsabile: responsible?.email || '',
            versione: asset.versione || 'N/D',
            ubicazione: asset.ubicazione || 'N/D',
            descrizione: asset.descrizione || '',
            data_inserimento: asset.data_inserimento || '',
            classificazione_criticita: asset.classificazione_criticita || 'Bassa'
        };
    });
}

function closeImportDialog() {
    const dialog = document.getElementById('asset-import-dialog');
    if (dialog?.open) dialog.close();
}

function resetImportDialogState() {
    pendingImportPreview = null;
    const acknowledge = document.getElementById('asset-import-acknowledge');
    if (acknowledge) acknowledge.checked = false;
    if (importCompleted) {
        importCompleted = false;
        navigateTo('inventory', { force: true });
    }
}

function renderImportPreview(preview) {
    const dialog = document.getElementById('asset-import-dialog');
    const subtitle = document.getElementById('asset-import-subtitle');
    const summary = document.getElementById('asset-import-summary');
    const tbody = document.getElementById('asset-import-preview-body');
    const report = document.getElementById('asset-import-report');
    const status = document.getElementById('asset-import-status');
    const confirmButton = document.getElementById('asset-import-confirm');
    const cancelButton = document.getElementById('asset-import-cancel');
    const acknowledge = document.getElementById('asset-import-acknowledge');
    const confirmationText = document.getElementById('asset-import-confirmation-text');
    if (!dialog || !summary || !tbody || !status || !confirmButton) return;

    pendingImportPreview = preview;
    importCompleted = false;
    if (subtitle) subtitle.textContent = `${preview.fileName} · foglio ${preview.sheetName}`;
    summary.innerHTML = `
        <strong>${preview.rows.length} righe analizzate</strong>
        <span>${preview.validRows.length} valide</span>
        <span>${preview.invalidRows.length} non importabili</span>
    `;
    tbody.innerHTML = preview.rows.map((row) => `
        <tr class="${row.valid ? 'import-row-valid' : 'import-row-invalid'}">
            <td class="cell-id">${row.rowNumber}</td>
            <td class="cell-primary">${escapeImportHtml(row.display.codice)}</td>
            <td class="cell-primary">${escapeImportHtml(row.display.nome)}</td>
            <td>${escapeImportHtml(row.display.categoria)}</td>
            <td>${escapeImportHtml(row.display.organizzazione)}</td>
            <td>${escapeImportHtml(row.display.criticita)}</td>
            <td>${row.valid ? '<span class="import-status-ok">Valida</span>' : `<span class="import-status-error">${escapeImportHtml(row.errors.join('; '))}</span>`}</td>
        </tr>
    `).join('');

    report?.classList.add('is-hidden');
    if (report) report.replaceChildren();
    status.textContent = preview.validRows.length > 0
        ? 'Controlla l’anteprima e conferma soltanto le righe valide.'
        : 'Il file non contiene righe importabili.';
    if (acknowledge) acknowledge.checked = false;
    if (confirmationText) {
        confirmationText.textContent = preview.validRows.length > 0
            ? `Confermo di aver controllato l’anteprima e di voler importare ${preview.validRows.length} righe valide.`
            : 'Non sono presenti righe valide da importare.';
    }
    confirmButton.disabled = true;
    confirmButton.textContent = 'Importa righe valide';
    if (cancelButton) cancelButton.textContent = 'Annulla';
    if (!dialog.open) dialog.showModal();
}

async function executePendingImport() {
    const confirmButton = document.getElementById('asset-import-confirm');
    const cancelButton = document.getElementById('asset-import-cancel');
    const status = document.getElementById('asset-import-status');
    const report = document.getElementById('asset-import-report');
    const acknowledge = document.getElementById('asset-import-acknowledge');
    if (!pendingImportPreview || !confirmButton || !status || !report) return;
    if (!acknowledge?.checked) {
        status.textContent = 'Conferma di aver verificato l’anteprima prima di avviare l’importazione.';
        acknowledge?.focus();
        return;
    }

    const successful = [];
    const failed = [];
    confirmButton.disabled = true;
    confirmButton.textContent = 'Importazione…';
    if (cancelButton) cancelButton.disabled = true;

    for (const row of pendingImportPreview.validRows) {
        status.textContent = `Importazione riga ${row.rowNumber}…`;
        try {
            const inserted = await insertAsset(row.payload);
            successful.push({ rowNumber: row.rowNumber, code: inserted.codice_asset });
        } catch (error) {
            failed.push({
                rowNumber: row.rowNumber,
                code: row.display.codice,
                message: formattaErroreOperativo(error)
            });
        }
    }

    importCompleted = successful.length > 0;
    report.classList.remove('is-hidden');
    report.innerHTML = `
        <h3>Esito importazione</h3>
        <p><strong>${successful.length}</strong> righe inserite; <strong>${failed.length}</strong> righe non inserite.</p>
        ${successful.length > 0 ? `<p class="import-status-ok">Inseriti: ${escapeImportHtml(successful.map((item) => item.code).join(', '))}</p>` : ''}
        ${failed.length > 0 ? `<ul class="import-error-list">${failed.map((item) => `<li>Riga ${item.rowNumber} (${escapeImportHtml(item.code)}): ${escapeImportHtml(item.message)}</li>`).join('')}</ul>` : ''}
    `;
    status.textContent = failed.length > 0
        ? 'Importazione conclusa con alcune righe non inserite.'
        : 'Importazione completata correttamente.';
    confirmButton.textContent = 'Importazione conclusa';
    if (cancelButton) {
        cancelButton.disabled = false;
        cancelButton.textContent = importCompleted ? 'Chiudi e aggiorna' : 'Chiudi';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('login-form');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const mfaVerifyBtn = document.getElementById('mfa-verify-btn');
    const mfaCancelBtn = document.getElementById('mfa-cancel-btn');
    const logoutBtn = document.getElementById('logout-btn');

    initializeNavigationControls();

    await initializeRouter({
        isAuthorized: isApplicationAuthorized,
        onRouteChange: activateApplicationRoute,
        onUnauthorized: () => {
            // La navigazione protetta rimane sospesa fino al completamento di login e MFA.
        },
        defaultRoute: 'dashboard'
    });
    routerReady = true;

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
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
                await recordAccessEvent('MFA_VERIFICATA', 'Verifica del secondo fattore TOTP completata con successo.');
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
    } finally {
        completeInitialBoot();
    }

    // =========================================================================
    // MODULI OPERATIVI ESISTENTI
    // =========================================================================

    const formAsset = document.getElementById('asset-form');
    if (formAsset) {
        formAsset.addEventListener('submit', async (event) => {
            event.preventDefault();

            const submitButton = formAsset.querySelector('button[type="submit"]');
            const defaultLabel = submitButton?.textContent || 'Salva Asset';

            const id = document.getElementById('asset-id')?.value ?? '';
            const codiceInput = document.getElementById('asset-codice');
            const codiceAsset = String(codiceInput?.value ?? '').trim().toUpperCase();
            const nome = document.getElementById('asset-nome')?.value.trim() ?? '';
            const categoriaAssetId = document.getElementById('asset-categoria')?.value ?? '';
            const organizzazioneId = document.getElementById('asset-organizzazione')?.value ?? '';
            const responsabileId = document.getElementById('asset-responsabile')?.value ?? '';
            const versione = document.getElementById('asset-versione')?.value.trim() ?? '';
            const ubicazione = document.getElementById('asset-ubicazione')?.value.trim() ?? '';
            const descrizione = document.getElementById('asset-descrizione')?.value.trim() ?? '';
            const criticita = document.getElementById('asset-criticita')?.value ?? '';

            if (codiceInput) codiceInput.value = codiceAsset;

            if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(codiceAsset)) {
                alert('Il codice asset deve contenere da 3 a 80 caratteri tra lettere maiuscole, numeri, trattino e underscore.');
                codiceInput?.focus();
                return;
            }

            if (!nome) {
                alert('Il nome dell’asset è obbligatorio.');
                document.getElementById('asset-nome')?.focus();
                return;
            }

            if (!categoriaAssetId || !organizzazioneId) {
                alert('Seleziona una categoria e un’organizzazione.');
                return;
            }

            const payload = {
                codice_asset: codiceAsset,
                nome,
                categoria_asset_id: categoriaAssetId,
                organizzazione_id: organizzazioneId,
                responsabile_id: responsabileId || null,
                versione,
                ubicazione,
                descrizione,
                criticita
            };

            try {
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.textContent = id ? 'Aggiornamento…' : 'Salvataggio…';
                }

                const assetSalvato = id
                    ? await updateAsset(id, payload)
                    : await insertAsset(payload);

                if (!assetSalvato?.id || assetSalvato.codice_asset !== codiceAsset) {
                    throw new Error('Il database non ha confermato i dati dell’asset.');
                }

                alert(
                    id
                        ? `Asset ${assetSalvato.codice_asset} aggiornato correttamente.`
                        : `Asset ${assetSalvato.codice_asset} registrato correttamente.`
                );

                await navigateTo('inventory', { force: true });
            } catch (error) {
                console.error('Errore database:', error);
                alert(`Errore operativo: ${formattaErroreOperativo(error)}`);
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = defaultLabel;
                }
            }
        });
    }

    const btnExportXls = document.getElementById('btn-export-xls');
    if (btnExportXls) {
        btnExportXls.addEventListener('click', async () => {
            const defaultLabel = btnExportXls.textContent;
            try {
                btnExportXls.disabled = true;
                btnExportXls.textContent = 'Esportazione…';
                const [assets, references] = await Promise.all([
                    fetchAssets(),
                    fetchAssetReferences()
                ]);
                const rows = buildAssetExportRows(assets, references);
                await exportFilteredAssetsToExcel(rows, {
                    testoRicerca: 'Nessuno',
                    criticita: 'Tutte',
                    categoria: 'Tutte',
                    organizzazione: 'Tutte',
                    numeroRisultati: rows.length
                });
            } catch (error) {
                console.error('Errore durante l’esportazione:', error);
                alert(`Errore durante l’esportazione: ${formattaErroreOperativo(error)}`);
            } finally {
                btnExportXls.disabled = false;
                btnExportXls.textContent = defaultLabel;
            }
        });
    }

    const btnExportFiltered = document.getElementById('btn-export-filtered');
    if (btnExportFiltered) {
        btnExportFiltered.addEventListener('click', async () => {
            const defaultLabel = btnExportFiltered.textContent;

            try {
                btnExportFiltered.disabled = true;
                btnExportFiltered.textContent = 'Esportazione…';

                const snapshot = getFilteredInventoryExportSnapshot();
                await exportFilteredAssetsToExcel(snapshot.assets, snapshot.criteria);
            } catch (error) {
                console.error('Errore durante l’esportazione filtrata:', error);
                alert(`Errore durante l’esportazione filtrata: ${formattaErroreOperativo(error)}`);
            } finally {
                btnExportFiltered.textContent = defaultLabel;
                const snapshot = getFilteredInventoryExportSnapshot();
                btnExportFiltered.disabled = snapshot.assets.length === 0;
            }
        });
    }

    const templateButton = document.getElementById('btn-download-import-template');
    if (templateButton) {
        templateButton.addEventListener('click', async () => {
            const defaultLabel = templateButton.textContent;
            try {
                templateButton.disabled = true;
                templateButton.textContent = 'Preparazione…';
                const references = await fetchAssetReferences();
                await downloadAssetImportTemplate(references);
            } catch (error) {
                console.error('Errore generazione modello import:', error);
                alert(`Impossibile generare il modello: ${formattaErroreOperativo(error)}`);
            } finally {
                templateButton.disabled = false;
                templateButton.textContent = defaultLabel;
            }
        });
    }

    const btnTriggerImport = document.getElementById('btn-trigger-import');
    const fileInput = document.getElementById('import-xls-input');
    const importDialog = document.getElementById('asset-import-dialog');
    const importClose = document.getElementById('asset-import-close');
    const importCancel = document.getElementById('asset-import-cancel');
    const importConfirm = document.getElementById('asset-import-confirm');
    const importAcknowledge = document.getElementById('asset-import-acknowledge');

    if (btnTriggerImport && fileInput) {
        btnTriggerImport.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const defaultLabel = btnTriggerImport.textContent;
            try {
                btnTriggerImport.disabled = true;
                btnTriggerImport.textContent = 'Analisi file…';
                const [references, existingAssets] = await Promise.all([
                    fetchAssetReferences(),
                    fetchAssets()
                ]);
                const preview = await parseAssetImportFile(file, references, existingAssets);
                renderImportPreview(preview);
            } catch (error) {
                console.error('Errore durante l’analisi del file:', error);
                alert(`File non importabile: ${formattaErroreOperativo(error)}`);
            } finally {
                fileInput.value = '';
                btnTriggerImport.disabled = false;
                btnTriggerImport.textContent = defaultLabel;
            }
        });
    }

    importClose?.addEventListener('click', closeImportDialog);
    importCancel?.addEventListener('click', closeImportDialog);
    importAcknowledge?.addEventListener('change', () => {
        const validRows = pendingImportPreview?.validRows?.length || 0;
        if (importConfirm) importConfirm.disabled = !(importAcknowledge.checked && validRows > 0);
    });
    importConfirm?.addEventListener('click', executePendingImport);
    importDialog?.addEventListener('click', (event) => {
        if (event.target === importDialog) closeImportDialog();
    });
    importDialog?.addEventListener('close', resetImportDialogState);
});
