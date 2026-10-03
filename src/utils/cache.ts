import NodeCache from "node-cache";

const cache = new NodeCache({
  stdTTL: 0,
  checkperiod: 120,
  useClones: false,
});

export const cacheStore = {
  get<T>(key: string): T | undefined {
    return cache.get<T>(key);
  },
  set<T>(key: string, value: T, ttlSeconds?: number): void {
    if (ttlSeconds !== undefined) cache.set(key, value, ttlSeconds);
    else cache.set(key, value);
  },
  del(key: string): void {
    cache.del(key);
  },
  has(key: string): boolean {
    return cache.has(key);
  },
  flush(): void {
    cache.flushAll();
  },
};

export default cacheStore;
