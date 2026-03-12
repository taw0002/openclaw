import { describe, expect, it } from "vitest";
import { normalizeStoredCronJobs } from "./store-migration.js";

describe("normalizeStoredCronJobs", () => {
  it("normalizes legacy cron fields and reports migration issues", () => {
    const jobs = [
      {
        jobId: "legacy-job",
        schedule: { kind: "cron", cron: "*/5 * * * *", tz: "UTC" },
        message: "say hi",
        model: "openai/gpt-4.1",
        deliver: true,
        provider: " TeLeGrAm ",
        to: "12345",
      },
    ] as Array<Record<string, unknown>>;

    const result = normalizeStoredCronJobs(jobs);

    expect(result.mutated).toBe(true);
    expect(result.issues).toMatchObject({
      jobId: 1,
      legacyScheduleCron: 1,
      legacyTopLevelPayloadFields: 1,
      legacyTopLevelDeliveryFields: 1,
    });

    const [job] = jobs;
    expect(job?.jobId).toBeUndefined();
    expect(job?.id).toBe("legacy-job");
    expect(job?.schedule).toMatchObject({
      kind: "cron",
      expr: "*/5 * * * *",
      tz: "UTC",
    });
    expect(job?.message).toBeUndefined();
    expect(job?.provider).toBeUndefined();
    expect(job?.delivery).toMatchObject({
      mode: "announce",
      channel: "telegram",
      to: "12345",
    });
    expect(job?.payload).toMatchObject({
      kind: "agentTurn",
      message: "say hi",
      model: "openai/gpt-4.1",
    });
  });

  it("normalizes payload provider alias into channel", () => {
    const jobs = [
      {
        id: "legacy-provider",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: {
          kind: "agentTurn",
          message: "ping",
          provider: " Slack ",
        },
      },
    ] as Array<Record<string, unknown>>;

    const result = normalizeStoredCronJobs(jobs);

    expect(result.mutated).toBe(true);
    expect(result.issues.legacyPayloadProvider).toBe(1);
    expect(jobs[0]?.payload).toMatchObject({
      kind: "agentTurn",
      message: "ping",
    });
    const payload = jobs[0]?.payload as Record<string, unknown> | undefined;
    expect(payload?.provider).toBeUndefined();
    expect(jobs[0]?.delivery).toMatchObject({
      mode: "announce",
      channel: "slack",
    });
  });

  it("does not report payloadKind issue for already-normalized payload kinds (#44054)", () => {
    const jobs = [
      {
        id: "already-ok",
        name: "Already Normalized",
        enabled: true,
        schedule: { kind: "cron", expr: "0 * * * *", staggerMs: 300000 },
        wakeMode: "next-heartbeat",
        sessionTarget: "isolated",
        payload: { kind: "agentTurn", message: "hello" },
        delivery: { mode: "announce" },
        state: {},
      },
      {
        id: "also-ok",
        name: "Also Normalized",
        enabled: true,
        schedule: { kind: "at", at: new Date().toISOString() },
        wakeMode: "next-heartbeat",
        sessionTarget: "main",
        payload: { kind: "systemEvent", text: "tick" },
        state: {},
      },
    ] as Array<Record<string, unknown>>;

    const result = normalizeStoredCronJobs(jobs);

    // payload.kind values are already correct — should NOT be flagged
    expect(result.issues.payloadKind).toBeUndefined();
    expect(result.issues.legacyPayloadKind).toBeUndefined();

    // Verify payload kinds weren't changed
    const p0 = (jobs[0].payload as { kind: string }).kind;
    const p1 = (jobs[1].payload as { kind: string }).kind;
    expect(p0).toBe("agentTurn");
    expect(p1).toBe("systemEvent");
  });
});
