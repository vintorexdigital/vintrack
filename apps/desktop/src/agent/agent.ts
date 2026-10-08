import { ApiError, isNetworkError, OfflineQueue, type ApiClient } from '@trackrex/client-core';
import { Bucketizer } from './bucketizer';
import { applyPolicy } from './privacy';
import type { ActivityBucket, ActivityPolicy, IdleSource, WindowSource } from './types';

export interface AgentDeps {
  api: ApiClient;
  queue: OfflineQueue;
  windows: WindowSource;
  idle: IdleSource;
  now: () => number;
  /** Seconds between samples. */
  intervalSeconds?: number;
  /** Seconds of no input before time counts as idle. */
  idleThresholdSeconds?: number;
  onState?: (s: AgentState) => void;
}

export interface AgentState {
  status: 'stopped' | 'waiting' | 'recording' | 'off';
  /** Why it is not recording, in words the person can read. */
  reason: string;
  policy: ActivityPolicy | null;
  today: { recordedMinutes: number; idleMinutes: number };
  lastApp: string | null;
  queued: number;
}

const BATCH = 100;

/**
 * Records desktop activity only while the person is punched in and the company has it switched on, and sends it
 * through the offline queue. The state it exposes is what the transparency window shows the employee.
 */
export class Agent {
  private readonly bucketizer: Bucketizer;
  private readonly interval: number;
  private readonly threshold: number;
  private policy: ActivityPolicy | null = null;
  private punchedIn = false;
  private pending: ActivityBucket[] = [];
  private state: AgentState = { status: 'stopped', reason: 'Not started', policy: null, today: { recordedMinutes: 0, idleMinutes: 0 }, lastApp: null, queued: 0 };
  private todayKey = '';

  constructor(private readonly d: AgentDeps) {
    this.interval = d.intervalSeconds ?? 5;
    this.threshold = d.idleThresholdSeconds ?? 120;
    this.bucketizer = new Bucketizer(this.interval);
  }

  getState(): AgentState { return { ...this.state, queued: this.d.queue.size }; }
  private set(p: Partial<AgentState>) { this.state = { ...this.state, ...p }; this.d.onState?.(this.getState()); }

  /** Ask the server what to collect and whether the person is working. Call at start and about once a minute. */
  async refresh(): Promise<void> {
    try {
      const [policy, status] = await Promise.all([
        this.d.api.get<ActivityPolicy>('/v1/activity/policy'),
        this.d.api.get<{ state?: 'in' | 'out' | 'break' }>('/v1/attendance/status'),
      ]);
      this.policy = policy;
      this.punchedIn = status.state === 'in';
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // Offline: keep the last known policy and state; the server discards anything outside working time anyway.
    }
    this.derive();
  }

  private derive() {
    if (!this.policy) return this.set({ status: 'waiting', reason: 'Waiting for your company’s settings', policy: null });
    if (!this.policy.enabled) return this.set({ status: 'off', reason: 'Your company has desktop activity switched off', policy: this.policy });
    if (!this.punchedIn) { this.closeBuckets(); return this.set({ status: 'waiting', reason: 'Not recording: you are not punched in', policy: this.policy }); }
    this.set({ status: 'recording', reason: 'Recording while you are punched in', policy: this.policy });
  }

  /** One tick: look at the focused window and add it to the minute in progress. */
  async tick(): Promise<void> {
    if (this.state.status !== 'recording' || !this.policy) return;
    const w = await this.d.windows.sample();
    if (!w) return;
    const at = this.d.now();
    const day = new Date(at).toDateString();
    if (day !== this.todayKey) { this.todayKey = day; this.set({ today: { recordedMinutes: 0, idleMinutes: 0 } }); }
    const clean = applyPolicy(w, this.policy);
    const idle = this.d.idle.idleSeconds() >= this.threshold;
    const done = this.bucketizer.add({ at, ...clean, idle });
    const add = done.reduce((s, b) => s + b.seconds, 0);
    const addIdle = done.reduce((s, b) => s + b.idleSeconds, 0);
    this.pending.push(...done);
    this.set({ lastApp: clean.app, today: { recordedMinutes: this.state.today.recordedMinutes + Math.round(add / 60), idleMinutes: this.state.today.idleMinutes + Math.round(addIdle / 60) } });
    if (this.pending.length >= BATCH) await this.send();
  }

  private closeBuckets() { this.pending.push(...this.bucketizer.flush()); }

  /** Hand finished buckets to the persistent queue, then try to send. */
  async send(): Promise<void> {
    while (this.pending.length) {
      const batch = this.pending.splice(0, BATCH);
      await this.d.queue.enqueue({ method: 'POST', path: '/v1/activity/buckets', quiet: true, label: `Activity (${batch.length} minutes)`, body: { buckets: batch } });
    }
    try { await this.d.queue.flush(this.d.api); } catch (e) { if (!(e instanceof ApiError) && !isNetworkError(e)) throw e; }
    this.set({});
  }

  /** On quit or sign-out: finish the minute in progress and send what is waiting. */
  async stop(): Promise<void> {
    this.closeBuckets();
    await this.send();
    this.set({ status: 'stopped', reason: 'Stopped' });
  }
}
