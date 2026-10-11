import { checksum } from "./core";

type Row = Record<string, unknown>;
type Query = {
  where(filter: Row): Query;
  limit(count: number): Query;
  get(): Promise<{ data?: Row[] | Row }>;
  count(): Promise<{ total?: number }>;
  update(data: Row): Promise<{ updated?: number | string }>;
};
type RawCollection = Query & {
  doc(id: string): { set(data: Row): Promise<unknown> };
  add(data: Row): Promise<unknown>;
};
export type RawDatabase = { collection(name: string): RawCollection };

export function physicalId(ownerId: string, collection: string, id: string): string {
  return checksum(`${ownerId}\0${collection}\0${id}`);
}

function normalize(row: Row): Row {
  return { ...row, _id: row.hubId ?? row._id };
}

// Queries always carry ownership, including document reads and CAS updates.
// Server-side CloudBase rules independently enforce ownership and invitation.
export function scopedDatabase(raw: RawDatabase, getUid: () => Promise<string>) {
  function collection(name: string) {
    const native = () => raw.collection(`hub_v2_${name}`);
    const makeQuery = (filter: Row = {}, count = 1000) => ({
      where(extra: Row) { return makeQuery({ ...filter, ...extra }, count); },
      limit(value: number) { return makeQuery(filter, value); },
      async get() {
        const uid = await getUid();
        const criteria: Row = { ...filter, ownerId: uid, _openid: uid };
        if (typeof criteria._id === "string") criteria._id = physicalId(uid, name, criteria._id);
        const result = await native().where(criteria).limit(count).get();
        const rows = !result.data ? [] : Array.isArray(result.data) ? result.data : [result.data];
        return { data: rows.map(normalize) };
      },
      async count() {
        const uid = await getUid();
        return native().where({ ...filter, ownerId: uid, _openid: uid }).count();
      },
      async update(data: Row) {
        if ("ownerId" in data || "_openid" in data || "hubId" in data || "_id" in data) throw new Error("不能修改数据归属或编号");
        const uid = await getUid();
        const criteria: Row = { ...filter, ownerId: uid, _openid: uid };
        if (typeof criteria._id === "string") criteria._id = physicalId(uid, name, criteria._id);
        return native().where(criteria).update(data);
      },
    });
    return {
      ...makeQuery(),
      doc(id: string) {
        return {
          async get() { return { data: (await makeQuery({ _id: id }).limit(1).get()).data[0] ?? null }; },
          async set(data: Row) {
            const uid = await getUid();
            const key = physicalId(uid, name, id);
            const existing = await makeQuery({ _id: id }).limit(1).get();
            const payload = { ...data, ownerId: uid, _openid: uid, hubId: id };
            if (!existing.data.length) return native().add({ ...payload, _id: key });
            const mutable = { ...data };
            for (const field of ["ownerId", "_openid", "hubId", "_id"]) delete mutable[field];
            return makeQuery({ _id: id }).update(mutable);
          },
          async update(data: Row) { return makeQuery({ _id: id }).update(data); },
        };
      },
      async add(data: Row) {
        const uid = await getUid();
        const id = globalThis.crypto.randomUUID();
        return native().add({ ...data, _id: physicalId(uid, name, id), ownerId: uid, _openid: uid, hubId: id });
      },
    };
  }
  return { collection };
}
