/**
 * Parser CSV minimale (sottoinsieme di RFC 4180): virgola come separatore, campi tra virgolette con `""` per la
 * virgoletta letterale, `\n`/`\r\n` come fine riga (anche dentro un campo tra virgolette).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const input = text.replace(/\r\n/g, '\n').replace(/﻿/, '');

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) endRow();
  // Righe completamente vuote (riga finale dopo l'ultimo a-capo) si scartano.
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}
