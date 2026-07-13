// ===========================================================================================
// FILE: src/auth.js Gestione dei flussi di autenticazione e verifica MFA (Challenge & Verify)
// ===========================================================================================
import { supabase } from './supabase.js';

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function getMFAStatus() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data;
}

export async function verifyOTP(code) {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;

    const totpFactor = factors.totp[0];
    if (!totpFactor) throw new Error("Nessun fattore TOTP trovato per questo utente.");

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
    if (challengeError) throw challengeError;

    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: code
    });
    if (verifyError) throw verifyError;
    return verifyData;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}