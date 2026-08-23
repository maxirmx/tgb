import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DraftMessage, PersistedState, UserState } from "./types.js";

const emptyState = (): PersistedState => ({ version: 1, users: {} });

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class StateStore {
  private state: PersistedState = emptyState();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filename: string) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.filename), { recursive: true });
    try {
      const contents = await readFile(this.filename, "utf8");
      const parsed = JSON.parse(contents) as PersistedState;
      if (parsed.version !== 1 || typeof parsed.users !== "object") {
        throw new Error("Unsupported state file format");
      }
      this.state = parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  async getUser(userId: number): Promise<UserState> {
    await this.queue;
    return clone(this.state.users[String(userId)] ?? { draft: [] });
  }

  async updateUser<T>(
    userId: number,
    updater: (state: UserState) => T | Promise<T>,
  ): Promise<T> {
    const operation = this.queue.then(async () => {
      const key = String(userId);
      const current = this.state.users[key] ?? { draft: [] };
      const result = await updater(current);
      this.state.users[key] = current;
      await this.persist();
      return result;
    });

    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async addDraftMessage(userId: number, message: DraftMessage): Promise<number> {
    return this.updateUser(userId, (state) => {
      if (!state.draft.some((item) => item.telegramMessageId === message.telegramMessageId)) {
        state.draft.push(message);
      }
      return state.draft.length;
    });
  }

  async clear(userId: number): Promise<void> {
    await this.updateUser(userId, (state) => {
      state.draft = [];
      delete state.flow;
      delete state.statusMessageId;
    });
  }

  private async persist(): Promise<void> {
    const temporary = `${this.filename}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    await rename(temporary, this.filename);
  }
}
