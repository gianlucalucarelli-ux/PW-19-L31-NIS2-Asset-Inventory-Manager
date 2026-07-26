// ===============================================================================================================
// FILE: src/dateTime.js
// DESCRIZIONE: Gestione centralizzata e coerente dei timestamp UTC del database e dell'orario Europe/Rome.
// ===============================================================================================================

const APPLICATION_TIME_ZONE = 'Europe/Rome';

/**
 * Verifica se il testo contiene già un'indicazione esplicita di fuso orario.
 */
function hasExplicitTimeZone(value) {
    return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value ?? '').trim());
}

/**
 * Normalizza i timestamp PostgreSQL senza fuso secondo la convenzione del progetto:
 * i valori memorizzati nelle colonne "timestamp" rappresentano un istante UTC.
 */
function normalizeDatabaseTimestamp(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';

    if (hasExplicitTimeZone(text)) return text;

    const match = text.match(
        /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d+))?$/
    );

    if (!match) return text;

    const [, datePart, hourMinute, seconds = '00', fraction = ''] = match;
    const milliseconds = fraction
        ? `.${fraction.slice(0, 3).padEnd(3, '0')}`
        : '';

    return `${datePart}T${hourMinute}:${seconds}${milliseconds}Z`;
}

/**
 * Converte un valore proveniente dal database in un oggetto Date affidabile.
 */
export function parseDatabaseTimestamp(value) {
    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    if (typeof value === 'number') {
        return new Date(value);
    }

    const normalized = normalizeDatabaseTimestamp(value);
    return normalized ? new Date(normalized) : new Date(NaN);
}

/**
 * Formatta un timestamp nel fuso operativo italiano.
 */
export function formatRomeDateTime(value, fallback = '—') {
    if (value === null || value === undefined || value === '') return fallback;

    const date = parseDatabaseTimestamp(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('it-IT', {
        timeZone: APPLICATION_TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

/**
 * Restituisce la data corrente nel formato YYYY-MM-DD usando Europe/Rome.
 */
export function formatRomeFileDate(value = new Date()) {
    const date = value instanceof Date ? value : parseDatabaseTimestamp(value);
    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: APPLICATION_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Restituisce il valore corrente per un input datetime-local nel fuso Europe/Rome.
 */
export function getRomeDateTimeLocalValue(value = new Date()) {
    const date = value instanceof Date ? value : parseDatabaseTimestamp(value);
    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: APPLICATION_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

/**
 * Calcola l'offset del fuso richiesto per uno specifico istante.
 */
function getTimeZoneOffsetMilliseconds(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour),
        Number(map.minute),
        Number(map.second)
    );

    return representedAsUtc - date.getTime();
}

/**
 * Converte un valore datetime-local, inteso come orario Europe/Rome, in UTC.
 * La doppia verifica dell'offset gestisce correttamente anche i passaggi ora legale/solare.
 */
function parseRomeLocalDateTime(value) {
    const match = String(value ?? '').trim().match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    );

    if (!match) return new Date(NaN);

    const [, year, month, day, hour, minute, second = '00'] = match;
    const wallClockUtc = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    );

    let offset = getTimeZoneOffsetMilliseconds(new Date(wallClockUtc), APPLICATION_TIME_ZONE);
    let instant = wallClockUtc - offset;
    const correctedOffset = getTimeZoneOffsetMilliseconds(new Date(instant), APPLICATION_TIME_ZONE);

    if (correctedOffset !== offset) {
        offset = correctedOffset;
        instant = wallClockUtc - offset;
    }

    return new Date(instant);
}

/**
 * Produce il formato UTC senza suffisso, coerente con le colonne PostgreSQL "timestamp" del progetto.
 */
function toDatabaseUtcTimestamp(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new Error('Data e ora non valide.');
    }

    return date.toISOString().slice(0, 19);
}

/**
 * Timestamp corrente UTC da inviare alle colonne PostgreSQL senza fuso.
 */
export function nowDatabaseUtcTimestamp() {
    return toDatabaseUtcTimestamp(new Date());
}

/**
 * Converte il valore di un input datetime-local Europe/Rome nel formato UTC del database.
 */
export function romeLocalInputToDatabaseUtc(value) {
    return toDatabaseUtcTimestamp(parseRomeLocalDateTime(value));
}
