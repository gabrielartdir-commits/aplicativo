import "server-only";

import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Banco local do BudgetOS.
 *
 * Um arquivo SQLite na pasta `data/`, aberto uma vez por processo. Usa o
 * `node:sqlite` do próprio Node 24 — sem dependência nativa para compilar,
 * que no Windows costuma ser a parte mais frágil de subir um banco embutido.
 *
 * O arquivo é o repositório de finanças: para fazer backup, basta copiá-lo;
 * para começar do zero, basta apagá-lo.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.BUDGETOS_DB ?? path.join(DATA_DIR, "budgetos.db");

let instance: DatabaseSync | null = null;

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new DatabaseSync(DB_PATH);

  // WAL deixa leitura e escrita conviverem sem travar uma à outra.
  db.exec("PRAGMA journal_mode = WAL");
  // Precisa ser ligado por conexão: sem isso as cascatas do schema não valem.
  db.exec("PRAGMA foreign_keys = ON");

  const schema = fs.readFileSync(
    path.join(process.cwd(), "lib", "db", "schema.sql"),
    "utf-8"
  );
  db.exec(schema);

  return db;
}

/** Conexão única do processo, criada na primeira chamada. */
export function db(): DatabaseSync {
  if (!instance) instance = open();
  return instance;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

type Row = Record<string, unknown>;
type Params = Record<string, unknown>;

/**
 * SQLite não tem booleano: `true` vira 1 e `undefined` vira `null`, senão o
 * driver recusa o valor. Datas e números passam direto.
 */
function bind(params: Params): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) out[key] = null;
    else if (typeof value === "boolean") out[key] = value ? 1 : 0;
    else if (typeof value === "number") out[key] = value;
    else out[key] = String(value);
  }
  return out;
}

export function all<T = Row>(sql: string, params: Params = {}): T[] {
  return db().prepare(sql).all(bind(params)) as T[];
}

export function get<T = Row>(sql: string, params: Params = {}): T | null {
  const row = db().prepare(sql).get(bind(params));
  return (row as T) ?? null;
}

export function run(sql: string, params: Params = {}): void {
  db().prepare(sql).run(bind(params));
}

/** Executa tudo ou nada — usado onde várias tabelas mudam juntas. */
export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (error) {
    conn.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Monta `SET a = :a, b = :b` a partir de um patch, ignorando chaves ausentes.
 * Devolve `null` quando não há nada a atualizar, para quem chama poder
 * evitar um UPDATE vazio (que o SQLite recusa).
 */
export function buildUpdate(
  patch: Record<string, unknown>,
  allowed: readonly string[]
): { clause: string; params: Params } | null {
  const keys = allowed.filter((key) => patch[key] !== undefined);
  if (keys.length === 0) return null;
  return {
    clause: keys.map((key) => `${key} = :${key}`).join(", "),
    params: Object.fromEntries(keys.map((key) => [key, patch[key]])),
  };
}
