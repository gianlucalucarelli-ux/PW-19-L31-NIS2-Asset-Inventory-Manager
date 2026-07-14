/*
 * NOME FILE: 07_impostazione_timezone_locale.sql
 * DESCRIZIONE:
 * Configurazione del timezone del database su 'Europe/Rome'.
 * Necessario per garantire che le funzioni di log (NOW()) 
 * utilizzino l'orario locale italiano (CEST) invece dell'UTC,
 * allineando i dati di audit con l'orario di sistema dell'applicativo.
 */
ALTER DATABASE postgres SET timezone TO 'Europe/Rome';

-- Verifica che sia stato applicato
SHOW timezone;