// ===========================================================================================
// FILE: src/auth.js
// DESCRIZIONE: Gestione centralizzata di autenticazione, sessione e verifica MFA.
// ===========================================================================================

import { supabase } from './supabase.js';

const DOCENTE_EMAIL = 'docentepegaso@gmail.com';

/**
 * Autentica l'utente con e-mail e password.
 */
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
    });

    if (error) throw error;
    return data;
}

/**
 * Restituisce la sessione corrente, aggiornandola automaticamente se necessario.
 */
export async function getCurrentSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
}

/**
 * Legge il livello di garanzia dell'autenticazione associato alla sessione corrente.
 */
export async function getMFAStatus() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
}

/**
 * Stabilisce se l'account è quello riservato alla valutazione docente.
 */
export function isEvaluationUser(user) {
    return user?.email?.trim().toLowerCase() === DOCENTE_EMAIL;
}

/**
 * Determina lo stato di accesso dell'utente prima di mostrare l'area applicativa.
 *
 * Gli utenti operativi devono raggiungere AAL2. L'account docente segue invece
 * il percorso di valutazione previsto dalle policy del progetto.
 */
export async function resolveAccessState(session) {
    if (!session?.user) {
        return {
            status: 'signed-out',
            accessType: null,
            currentLevel: null,
            nextLevel: null
        };
    }

    if (isEvaluationUser(session.user)) {
        return {
            status: 'authorized',
            accessType: 'evaluation',
            currentLevel: 'aal1',
            nextLevel: 'aal1'
        };
    }

    const mfaStatus = await getMFAStatus();
    const currentLevel = mfaStatus.currentLevel ?? 'aal1';
    const nextLevel = mfaStatus.nextLevel ?? currentLevel;

    if (currentLevel === 'aal2') {
        return {
            status: 'authorized',
            accessType: 'mfa',
            currentLevel,
            nextLevel
        };
    }

    if (nextLevel === 'aal2') {
        return {
            status: 'mfa-required',
            accessType: 'mfa',
            currentLevel,
            nextLevel
        };
    }

    return {
        status: 'blocked',
        accessType: 'mfa',
        currentLevel,
        nextLevel,
        message: 'L’account non dispone di un fattore MFA verificato. Contatta l’amministratore del sistema.'
    };
}

/**
 * Verifica un codice TOTP usando il primo fattore MFA verificato disponibile.
 */
export async function verifyOTP(code) {
    const normalizedCode = code.trim();

    if (!/^\d{6}$/.test(normalizedCode)) {
        throw new Error('Il codice deve contenere esattamente 6 cifre.');
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;

    const totpFactor = factors.totp?.find((factor) => factor.status === 'verified');
    if (!totpFactor) {
        throw new Error('Nessun fattore TOTP verificato è associato a questo account.');
    }

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totpFactor.id,
        code: normalizedCode
    });

    if (error) throw error;
    return data;
}

/**
 * Registra un osservatore sugli eventi di autenticazione.
 *
 * L'elaborazione viene spostata fuori dal callback Supabase per evitare che
 * operazioni asincrone successive blocchino la gestione interna della sessione.
 */
export function observeAuthState(handler) {
    return supabase.auth.onAuthStateChange((event, session) => {
        window.setTimeout(() => {
            handler(event, session);
        }, 0);
    });
}

/**
 * Termina la sessione corrente.
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}
