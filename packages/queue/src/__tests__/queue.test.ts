import { afterEach, describe, expect, it, vi } from "vitest";

// Sin REDIS_URL (local): la cola queda deshabilitada y enqueue hace no-op.
delete process.env.REDIS_URL;
const { enqueue, isQueueEnabled, registerWorker, queueStatus } = await import("../index.js");

describe("cola sin Redis (comportamiento local)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("isQueueEnabled es false sin REDIS_URL", () => {
    expect(isQueueEnabled).toBe(false);
    expect(queueStatus()).toContain("disabled");
  });

  it("enqueue hace no-op y devuelve false", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = await enqueue("media", {
      tenantId: "t1",
      assetKey: "t1/a.jpg",
      op: "resize",
    });
    expect(ok).toBe(false);
  });

  it("registerWorker devuelve null sin arrancar nada", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(registerWorker("email", async () => {})).toBeNull();
  });
});
