import { LIST_STORES, type Changes, type Data } from '../domain/types';

export function applyToData(data: Data, ch: Changes): Data {
  const next: Data = { ...data };
  for (const store of LIST_STORES) {
    const del = ch.del?.[store];
    const put = ch.put?.[store] as { id: string }[] | undefined;
    if (!del?.length && !put?.length) continue;
    let list = data[store] as { id: string }[];
    if (del?.length) {
      const ids = new Set(del);
      list = list.filter((r) => !ids.has(r.id));
    }
    if (put?.length) {
      const byId = new Map(put.map((r) => [r.id, r]));
      list = list.map((r) => byId.get(r.id) ?? r);
      const known = new Set(list.map((r) => r.id));
      list = [...list, ...put.filter((r) => !known.has(r.id))];
    }
    (next as unknown as Record<string, unknown>)[store] = list;
  }
  if (ch.put?.prefs) next.prefs = ch.put.prefs;
  return next;
}
