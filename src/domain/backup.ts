import { LIST_STORES, type Data } from './types';

export const APP_ID = 'constancia';
export const SCHEMA_VERSION = 1;

export interface ExportFile {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: Data;
}

export function buildExport(data: Data, nowIso: string): ExportFile {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso, data };
}

export type ParseResult = { ok: true; file: ExportFile } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseImport(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (!isObj(json) || json.app !== APP_ID) {
    return { ok: false, error: 'Este arquivo não é uma cópia de segurança do Constância.' };
  }
  if (typeof json.schemaVersion !== 'number') {
    return { ok: false, error: 'A versão do esquema está ausente no arquivo.' };
  }
  if (json.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `O arquivo usa a versão ${json.schemaVersion} do esquema, mais nova que a suportada (${SCHEMA_VERSION}).`,
    };
  }
  const data = json.data;
  if (!isObj(data)) return { ok: false, error: 'O arquivo não contém a seção de dados.' };
  for (const store of LIST_STORES) {
    const list = data[store];
    if (!Array.isArray(list)) return { ok: false, error: `A lista "${store}" está ausente ou inválida.` };
    if (!list.every((r) => isObj(r) && typeof r.id === 'string' && r.id.length > 0)) {
      return { ok: false, error: `A lista "${store}" contém registros sem identificador.` };
    }
  }
  const prefs = data.prefs;
  if (!isObj(prefs) || prefs.id !== 'prefs' || (prefs.weekStart !== 0 && prefs.weekStart !== 1)) {
    return { ok: false, error: 'As preferências do arquivo estão inválidas.' };
  }
  return { ok: true, file: json as unknown as ExportFile };
}
