

export function get<T = any>(key: IDBValidKey): Promise<T | undefined>
export function set(key: IDBValidKey, value: any) : Promise<void>
export function setMany(entries: [IDBValidKey, any][])
export function getMany<T = any>(keys: IDBValidKey[]): Promise<(T | undefined)[]>
export function update<T = any>(key: IDBValidKey, updater: (oldValue: T | undefined) => T): Promise<void>

