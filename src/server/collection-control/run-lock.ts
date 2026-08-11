import "server-only";

const KEY = Symbol.for("nearby-jobs.collection-exclusive-run");
type Scope = typeof globalThis & { [KEY]?: string | null };
const scope = () => globalThis as Scope;

export function activeCollectionRunOwner(): string | null { return scope()[KEY] ?? null; }
export function acquireCollectionRun(owner: string): void {
  if (activeCollectionRunOwner()) throw Object.assign(new Error("이미 실행 중인 수집 작업이 있습니다."), { code: "COLLECTION_RUN_CONFLICT", status: 409 });
  scope()[KEY] = owner;
}
export function releaseCollectionRun(owner: string): void { if (scope()[KEY] === owner) scope()[KEY] = null; }
