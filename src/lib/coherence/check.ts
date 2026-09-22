/**
 * Controllo di coerenza (#41): anomalie temporali sull'intervallo di validità di una relazione. Lo schema è
 * `{calendar?, year, month?, day?}` (D-026); il database garantisce già `from.year <= to.year` ma solo a livello di
 * anno (`private.valid_time`, relation_details.sql), quindi un'inversione dentro lo stesso anno (mese o giorno)
 * passa inosservata lì. Qui si va a precisione di mese/giorno, ma solo quando entrambi i capi la specificano: con
 * un capo meno preciso non c'è abbastanza informazione per dire che è invertito, quindi non si segnala nulla
 * (meglio un falso negativo che un falso allarme).
 */

export type ValidTime = { calendar?: string; year: number; month?: number; day?: number };

export function isTemporalAnomaly(validFrom: ValidTime | null, validTo: ValidTime | null): boolean {
  if (!validFrom || !validTo) return false;
  if (validFrom.year !== validTo.year) return false;
  if (validFrom.month === undefined || validTo.month === undefined) return false;
  if (validFrom.month !== validTo.month) return validFrom.month > validTo.month;
  if (validFrom.day === undefined || validTo.day === undefined) return false;
  return validFrom.day > validTo.day;
}
