import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { initialState, type State } from '../../../packages/shared/src/index.js';

export interface Repository {
  read(): Promise<State>;
  mutate<T>(operation: (state: State) => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class FileRepository implements Repository {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filename: string;
  constructor(directory: string) {
    this.filename = resolve(directory, 'state.json');
  }
  private async load() {
    try {
      return JSON.parse(await readFile(this.filename, 'utf8')) as State;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialState();
      throw error;
    }
  }
  async read() {
    await this.queue;
    return this.load();
  }
  async mutate<T>(operation: (state: State) => T | Promise<T>): Promise<T> {
    const work = this.queue.then(async () => {
      const state = await this.load();
      const result = await operation(state);
      await mkdir(resolve(this.filename, '..'), { recursive: true });
      const temp = this.filename + '.tmp';
      await writeFile(temp, JSON.stringify(state, null, 2));
      await rename(temp, this.filename);
      return result;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  async close() {
    await this.queue;
  }
}
// 首版 PostgreSQL 使用事务锁保护的一份 JSONB 状态；仓储接口允许后续迁移为空间关系表。
export class PostgresRepository implements Repository {
  private pool: Pool;
  private ready: Promise<void>;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 5 });
    this.ready = this.initialize();
  }
  private async initialize() {
    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS fishing_state (id integer PRIMARY KEY CHECK (id=1), payload jsonb NOT NULL)',
    );
    await this.pool.query('INSERT INTO fishing_state(id,payload) VALUES(1,$1) ON CONFLICT(id) DO NOTHING', [
      JSON.stringify(initialState()),
    ]);
  }
  async read() {
    await this.ready;
    return (await this.pool.query('SELECT payload FROM fishing_state WHERE id=1')).rows[0].payload as State;
  }
  async mutate<T>(operation: (state: State) => T | Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = (await client.query('SELECT payload FROM fishing_state WHERE id=1 FOR UPDATE')).rows[0]
        .payload as State;
      const result = await operation(state);
      await client.query('UPDATE fishing_state SET payload=$1 WHERE id=1', [JSON.stringify(state)]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
