/**
 * Schema + preset registry.
 *
 * On disk:  _schemas/<type>.schema.json   and   _presets/<type>/<id>.yaml
 * Built-ins are written there on first run (never overwritten afterwards), so
 * every type and preset is editable — and you can add new ones by dropping a
 * file in.
 */
import YAML from "yaml";
import type { StorageAdapter } from "../storage/adapter";
import { joinPath } from "../storage/adapter";
import type { Preset, TypeSchema, FieldSchema } from "../types";
import { VAULT } from "../types";
import { BUILTIN_SCHEMAS } from "./builtin/schemas";
import { BUILTIN_PRESETS } from "./builtin/presets";

export class Registry {
  schemas = new Map<string, TypeSchema>();
  presets: Preset[] = [];
  problems: string[] = [];

  constructor() {
    for (const s of BUILTIN_SCHEMAS) this.schemas.set(s.id, s);
    this.presets = [...BUILTIN_PRESETS];
  }

  types(): TypeSchema[] {
    return [...this.schemas.values()];
  }

  get(type: string): TypeSchema | undefined {
    return this.schemas.get(type);
  }

  presetsFor(type: string): Preset[] {
    return this.presets.filter((p) => p.type === type);
  }

  /** Folder for a type; unknown types fall back to the type id itself. */
  folderFor(type: string): string {
    return this.schemas.get(type)?.folder ?? type;
  }

  /** Load on-disk schemas & presets, overriding built-ins by id. */
  async load(fs: StorageAdapter): Promise<void> {
    this.problems = [];
    // schemas
    try {
      const entries = await fs.list(VAULT.schemasDir);
      for (const e of entries) {
        if (e.isDir || !e.name.endsWith(".schema.json") || /\.schema\.v\d+\.json$/.test(e.name)) continue;
        try {
          const raw = JSON.parse(await fs.readText(joinPath(VAULT.schemasDir, e.name))) as TypeSchema;
          if (raw && typeof raw.id === "string" && raw.fields) this.schemas.set(raw.id, normalizeSchema(raw));
          else this.problems.push(`${e.name}: not a type schema (needs id, fields)`);
        } catch (err) {
          this.problems.push(`${e.name}: ${(err as Error).message}`);
        }
      }
    } catch {
      /* no _schemas dir yet */
    }
    // presets
    try {
      const typeDirs = await fs.list(VAULT.presetsDir);
      const disk: Preset[] = [];
      for (const d of typeDirs) {
        if (!d.isDir) continue;
        const files = await fs.list(joinPath(VAULT.presetsDir, d.name));
        for (const f of files) {
          if (f.isDir || !/\.(ya?ml|json)$/i.test(f.name)) continue;
          try {
            const text = await fs.readText(joinPath(VAULT.presetsDir, d.name, f.name));
            const raw = (f.name.endsWith(".json") ? JSON.parse(text) : YAML.parse(text)) as Preset;
            const id = raw.id ?? f.name.replace(/\.(ya?ml|json)$/i, "");
            disk.push({ ...raw, id, type: raw.type ?? d.name, fields: raw.fields ?? {} });
          } catch (err) {
            this.problems.push(`${d.name}/${f.name}: ${(err as Error).message}`);
          }
        }
      }
      if (disk.length) {
        const byKey = new Map(this.presets.map((p) => [`${p.type}/${p.id}`, p]));
        for (const p of disk) byKey.set(`${p.type}/${p.id}`, p);
        this.presets = [...byKey.values()];
      }
    } catch {
      /* no _presets dir yet */
    }
  }

  /** Write built-ins to disk where missing. Returns number of files written. */
  async seed(fs: StorageAdapter): Promise<number> {
    let n = 0;
    await fs.mkdirAll(VAULT.schemasDir);
    for (const s of BUILTIN_SCHEMAS) {
      const p = joinPath(VAULT.schemasDir, `${s.id}.schema.json`);
      if (!(await fs.exists(p))) {
        await fs.writeText(p, JSON.stringify(s, null, 2) + "\n");
        n++;
        continue;
      }
      // upgrade an older built-in unless the user marked the file custom
      try {
        const disk = JSON.parse(await fs.readText(p)) as TypeSchema;
        const diskV = typeof disk.version === "number" ? disk.version : 0;
        if (!disk.custom && (s.version ?? 1) > diskV) {
          await fs.writeText(joinPath(VAULT.schemasDir, `${s.id}.schema.v${diskV || 1}.json`), JSON.stringify(disk, null, 2) + "\n");
          await fs.writeText(p, JSON.stringify(s, null, 2) + "\n");
          n++;
        }
      } catch {
        /* unreadable: leave it, load() will report */
      }
    }
    for (const pr of BUILTIN_PRESETS) {
      const dir = joinPath(VAULT.presetsDir, pr.type);
      await fs.mkdirAll(dir);
      const p = joinPath(dir, `${pr.id}.yaml`);
      if (!(await fs.exists(p))) {
        await fs.writeText(p, YAML.stringify(pr, { lineWidth: 100 }));
        n++;
      }
    }
    return n;
  }
}

function normalizeSchema(s: TypeSchema): TypeSchema {
  const fields: FieldSchema = s.fields?.type === "object" ? s.fields : { type: "object", properties: s.fields?.properties ?? {} };
  return { ...s, folder: s.folder || s.id, title: s.title || s.id, fields };
}

/** Walk a field schema and produce default values (respecting `default`). */
export function defaultsFor(schema: FieldSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(schema.properties ?? {})) {
    if (f.default !== undefined) out[k] = structuredClone(f.default);
    else if (f.type === "object" && f.properties) {
      const inner = defaultsFor(f);
      if (Object.keys(inner).length) out[k] = inner;
    }
  }
  return out;
}
