type Event = { id: string; event: string; ts: number };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export function createClickTracker(storage: Storage, owner: () => Promise<string | null>, send: (events: Event[]) => Promise<{ acknowledged: string[] }>) {
  let work: Promise<unknown> = Promise.resolve();
  let flushing: Promise<void> | null = null;
  const key = (id: string) => `jr.clicks.${id}`;
  const locked = <T,>(fn: () => Promise<T>) => { const next = work.then(fn); work = next.catch(error => console.error("[click-tracking] local queue operation failed", error)); return next; };
  const read = async (id: string): Promise<Event[]> => { const raw = await storage.getItem(key(id)); const data = raw ? JSON.parse(raw) : []; if (!Array.isArray(data)) throw new Error("Click queue is invalid"); return data; };
  const flush = () => {
    if (flushing) return flushing;
    flushing = (async () => {
      const id = await owner(); if (!id) return;
      const events = await locked(async () => (await read(id)).slice(0, 50));
      if (!events.length) return;
      if (await owner() !== id) throw new Error("Account changed during click sync");
      const response = await send(events);
      if (!Array.isArray(response.acknowledged) || events.some(e => !response.acknowledged.includes(e.id))) throw new Error("Click events were not acknowledged");
      await locked(async () => { const remaining = (await read(id)).filter(e => !response.acknowledged.includes(e.id)); await storage.setItem(key(id), JSON.stringify(remaining)); });
    })().finally(() => { flushing = null; });
    return flushing;
  };
  const track = (event: string) => {
    void locked(async () => {
      const id = await owner(); if (!id) return;
      const events = await read(id);
      if (events.length >= 250) throw new Error("Click queue full; newest analytics event could not be saved");
      const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === "x" ? n : (n & 3) | 8).toString(16); });
      events.push({ id: uuid, event, ts: Date.now() });
      await storage.setItem(key(id), JSON.stringify(events));
    }).then(flush).catch(error => console.warn("[click-tracking] sync pending", error));
  };
  return { track, flush };
}
