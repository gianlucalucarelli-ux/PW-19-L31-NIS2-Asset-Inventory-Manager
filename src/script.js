const SUPABASE_URL = 'https://jacyruehgxjzxufzfoly.supabase.co';
// TODO: Incolla qui dentro la tua chiave anon public reale presa dalle impostazioni API (inizia con eyJ...)
const SUPABASE_KEY = 'https://jacyruehgxjzxufzfoly.supabase.co/rest/v1/'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Gestione visualizzazioni sicura
function getViewElements() {
    return {
        login: document.getElementById('login-view'),
        mfa: document.getElementById('mfa-view'),
        dashboard: document.getElementById('dashboard-container'),
        error: document.getElementById('auth-error'),
        authContainer: document.getElementById('auth-container'),
        navMenu: document.getElementById('nav-menu-links'),
        logoutBtn: document.getElementById('logout-btn')
    };
}

/**
 * LOGIN INIZIALE (FASE 1)
 */
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const els = getViewElements();
    els.error.textContent = "";
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) { 
        els.error.textContent = "Errore: " + error.message; 
        return; 
    }

    checkMFA();
});

/**
 * CONTROLLO STATO MULTI-FACTOR AUTHENTICATION
 */
async function checkMFA() {
    const els = getViewElements();
    const { data: factors, error } = await _supabase.auth.mfa.listFactors();
    
    if (error) {
        els.error.textContent = "Errore controllo MFA: " + error.message;
        return;
    }

    // Se non c'è un secondo fattore attivo, avvia l'iscrizione (Enrollment)
    if (!factors || factors.totp.length === 0) {
        enrollMFA();
    } else {
        // Se esiste già, chiedi la verifica (Challenge)
        showMFAChallenge(factors.totp[0].id);
    }
}

/**
 * ATTIVAZIONE MFA (PRIMO ACCESSO)
 */
async function enrollMFA() {
    const els = getViewElements();
    const { data, error } = await _supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) { els.error.textContent = error.message; return; }

    els.login.style.display = 'none';
    els.mfa.style.display = 'block';
    document.getElementById('mfa-title').textContent = "Attiva 2FA (TOTP)";
    document.getElementById('mfa-desc').textContent = "Inserisci questa stringa segreta nella tua App Authenticator (Google/Microsoft) per attivare la protezione NIS2:";
    document.getElementById('mfa-setup-area').style.display = 'block';
    document.getElementById('mfa-secret').textContent = data.totp.secret;

    document.getElementById('mfa-verify-btn').onclick = () => verifyEnroll(data.id);
}

async function verifyEnroll(factorId) {
    const els = getViewElements();
    const code = document.getElementById('mfa-code').value;
    
    const { data, error } = await _supabase.auth.mfa.challenge({ factorId });
    if (error) { els.error.textContent = "Errore sfida: " + error.message; return; }

    const { error: vError } = await _supabase.auth.mfa.verify({ factorId, challengeId: data.id, code });
    if (vError) { els.error.textContent = "Codice OTP non valido. Riprova."; return; }
    
    location.reload();
}

/**
 * SFIDA MFA (ACCESSI SUCCESSIVI)
 */
async function showMFAChallenge(factorId) {
    const els = getViewElements();
    els.login.style.display = 'none';
    els.mfa.style.display = 'block';
    document.getElementById('mfa-title').textContent = "Verifica Identità (2FA)";
    document.getElementById('mfa-desc').textContent = "Inserisci il codice temporaneo generato dalla tua applicazione per sbloccare l'inventario asset.";

    document.getElementById('mfa-verify-btn').onclick = async () => {
        const code = document.getElementById('mfa-code').value;
        const { data, error } = await _supabase.auth.mfa.challenge({ factorId });
        if (error) { els.error.textContent = error.message; return; }

        const { error: vError } = await _supabase.auth.mfa.verify({ factorId, challengeId: data.id, code });
        if (vError) { els.error.textContent = "Codice OTP errato."; return; }
        
        showDashboard();
    };
}

/**
 * SBLOCCO INTERFACCIA E CARICAMENTO DATI
 */
function showDashboard() {
    const els = getViewElements();
    if (els.authContainer) els.authContainer.style.display = 'none';
    if (els.navMenu) els.navMenu.style.display = 'flex';
    if (els.logoutBtn) els.logoutBtn.style.display = 'block';
    if (els.dashboard) els.dashboard.style.display = 'block';
    loadAssets();
}

async function loadAssets() {
    const tbody = document.getElementById('asset-table-body');
    if (!tbody) return;

    const { data, error } = await _supabase
        .from('asset')
        .select('id, nome, versione, classificazione_criticita, relazione_asset_servizio(servizio_essenziale(nome_servizio))');
    
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger); text-align:center;">Errore RLS: Accesso negato al database.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = data.map(a => {
        const relazioni = a.relazione_asset_servizio || [];
        const servizi = relazioni.map(r => r.servizio_essenziale?.nome_servizio).filter(Boolean).join(', ') || 'Nessuno';
        const crit = a.classificazione_criticita || 'Bassa';
        return `
            <tr>
                <td>#${a.id}</td>
                <td><strong>${a.nome}</strong></td>
                <td><code>${a.versione || '---'}</code></td>
                <td><span class="risk-badge ${crit === 'Alta' || crit === 'Critica' ? 'risk-high' : 'risk-none'}">${crit}</span></td>
                <td>${servizi}</td>
            </tr>
        `;
    }).join('');
}

/**
 * NAVIGAZIONE MENU E TEMA
 */
document.getElementById('theme-toggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', currentTheme === 'light' ? 'dark' : 'light');
});

document.getElementById('logout-btn').onclick = async () => { 
    await _supabase.auth.signOut(); 
    location.reload(); 
};

const links = document.querySelectorAll('.nav-link');
links.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const target = link.getAttribute('href');
        document.getElementById('dashboard-container').style.display = target === '#dashboard-section' ? 'block' : 'none';
        document.getElementById('info-container').style.display = target === '#info-section' ? 'block' : 'none';
    });
});

// Controllo persistenza sessione
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const { data } = await _supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data && data.currentLevel === 'aal2') {
            showDashboard();
        } else {
            checkMFA();
        }
    }
});
