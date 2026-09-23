/**
 * JQL-lite search engine.
 * Pipeline: Lexer → Parser → AST → Validator/Resolver → Prisma where (never raw SQL).
 *
 * Grammar:
 *   query   := orExpr
 *   orExpr  := andExpr ( OR andExpr )*
 *   andExpr := unit ( AND unit )*
 *   unit    := '(' orExpr ')' | FIELD OP VALUE
 *   OP      := '=' | '!=' | '~' (contains)
 *
 * Fields: status, type, priority, assignee, reporter, sprint, project,
 *         summary, description, label, points, due, created, updated,
 *         cf.<Name> / customfield.<Name> (org custom fields)
 * Values: quoted "multi word", bare-word, `me`, `none`, `anyone`, `overdue`,
 *         `7d` style relative days (created/updated), numbers for points.
 */

export type JqlOp = "=" | "!=" | "~";

export interface JqlClause {
  kind: "clause";
  field: string;
  op: JqlOp;
  value: string;
  pos: number;
}

export interface JqlGroup {
  kind: "group";
  op: "AND" | "OR";
  children: JqlNode[];
}

export type JqlNode = JqlClause | JqlGroup;

export class JqlError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.name = "JqlError";
    this.pos = pos;
  }
}

export const JQL_FIELDS = [
  "status", "type", "priority", "assignee", "reporter", "sprint",
  "project", "summary", "description", "label", "points", "due", "created", "updated",
] as const;

const KEYWORDS = new Set(["AND", "OR"]);

// ─── Lexer ──────────────────────────────────────────────────────

interface Token {
  type: "field" | "word" | "string" | "number" | "op" | "lparen" | "rparen" | "and" | "or";
  value: string;
  pos: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "(") { tokens.push({ type: "lparen", value: "(", pos: i }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")", pos: i }); i++; continue; }
    if (input.startsWith("!=", i)) { tokens.push({ type: "op", value: "!=", pos: i }); i += 2; continue; }
    if (ch === "=") { tokens.push({ type: "op", value: "=", pos: i }); i++; continue; }
    if (ch === "~") { tokens.push({ type: "op", value: "~", pos: i }); i++; continue; }
    if (ch === '"' || ch === "'") {
      const end = input.indexOf(ch, i + 1);
      if (end === -1) throw new JqlError("Unterminated quoted value", i);
      tokens.push({ type: "string", value: input.slice(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }
    // bare word / keyword / field
    let j = i;
    while (j < input.length && !/[\s()=!~]/.test(input[j])) j++;
    const word = input.slice(i, j);
    // Custom fields: cf.<Name> or customfield.<Name> — kept as-is here;
    // resolution against org CustomField definitions happens in buildWhere.
    const cfMatch = word.match(/^(?:cf|customfield)[.:](.+)$/);
    if (cfMatch) {
      tokens.push({ type: "field", value: `cf:${cfMatch[1].toLowerCase()}`, pos: i });
      i = j;
      continue;
    }
    if (!word) throw new JqlError(`Unexpected character "${ch}"`, i);
    const upper = word.toUpperCase();
    if (upper === "AND") tokens.push({ type: "and", value: word, pos: i });
    else if (upper === "OR") tokens.push({ type: "or", value: word, pos: i });
    else if (/^\d+(\.\d+)?$/.test(word)) tokens.push({ type: "number", value: word, pos: i });
    else if (tokens.length === 0 || tokens[tokens.length - 1].type === "and" || tokens[tokens.length - 1].type === "or" || tokens[tokens.length - 1].type === "lparen")
      tokens.push({ type: "field", value: word.toLowerCase(), pos: i });
    else tokens.push({ type: "word", value: word, pos: i });
    i = j;
  }
  return tokens;
}

// ─── Parser ─────────────────────────────────────────────────────

export function parseJql(input: string): JqlNode {
  const tokens = tokenize(input);
  if (!tokens.length) throw new JqlError("Empty query", 0);
  let p = 0;

  function peek(): Token | undefined { return tokens[p]; }

  function parseOr(): JqlNode {
    const children: JqlNode[] = [parseAnd()];
    while (peek()?.type === "or") { p++; children.push(parseAnd()); }
    return children.length === 1 ? children[0] : { kind: "group", op: "OR", children };
  }

  function parseAnd(): JqlNode {
    const children: JqlNode[] = [parseUnit()];
    while (peek()?.type === "and") { p++; children.push(parseUnit()); }
    return children.length === 1 ? children[0] : { kind: "group", op: "AND", children };
  }

  function parseUnit(): JqlNode {
    const t = peek();
    if (!t) throw new JqlError("Unexpected end of query", input.length);
    if (t.type === "lparen") {
      p++;
      const node = parseOr();
      const close = peek();
      if (!close || close.type !== "rparen") throw new JqlError("Missing closing parenthesis", t.pos);
      p++;
      return node;
    }
    if (t.type !== "field") throw new JqlError(`Expected a field, got "${t.value}"`, t.pos);
    if (!t.value.startsWith("cf:") && !JQL_FIELDS.includes(t.value as (typeof JQL_FIELDS)[number])) {
      throw new JqlError(`Unknown field "${t.value}". Try: ${JQL_FIELDS.join(", ")} or cf.<Name> for custom fields`, t.pos);
    }
    p++;
    const op = peek();
    if (!op || op.type !== "op") throw new JqlError(`Expected =, != or ~ after "${t.value}"`, t.pos);
    p++;
    const val = peek();
    if (!val || !["word", "string", "number"].includes(val.type)) {
      throw new JqlError(`Expected a value after "${t.value} ${op.value}"`, op.pos);
    }
    p++;
    return { kind: "clause", field: t.value, op: op.value as JqlOp, value: val.value, pos: t.pos };
  }

  const node = parseOr();
  if (p < tokens.length) throw new JqlError(`Unexpected "${tokens[p].value}"`, tokens[p].pos);
  return node;
}

/** Pretty-print an AST back to canonical JQL (for saved-filter display). */
export function astToJql(node: JqlNode): string {
  if (node.kind === "clause") return `${node.field} ${node.op} ${node.value}`;
  return node.children.map(astToJql).join(` ${node.op} `);
}

// ─── Resolver: AST → Prisma where ───────────────────────────────

export interface JqlContext {
  orgId: string;
  meId: string;
  statuses: { id: string; name: string }[];
  types: { id: string; name: string }[];
  priorities: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  members: { userId: string; user: { name: string; email: string } }[];
  projects: { id: string; key: string; name: string }[];
  sprints: { id: string; name: string }[];
  customFields: { id: string; name: string; type: string }[];
}

 
type Where = any;

function resolveUser(value: string, ctx: JqlContext): string[] | null {
  // returns list of matching userIds, ["none"] sentinel for unassigned, null = no match
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "unassigned" || v === "empty") return ["none"];
  if (v === "anyone" || v === "any") return [];
  if (v === "me" || v === "currentuser()") return [ctx.meId];
  const byEmail = ctx.members.find((m) => m.user.email.toLowerCase() === v);
  if (byEmail) return [byEmail.userId];
  const byName = ctx.members.filter((m) => m.user.name.toLowerCase().includes(v));
  if (byName.length) return byName.map((m) => m.userId);
  return null;
}

/**
 * Custom-field clauses: cf.<Name> OP VALUE.
 * Issue.customFields is a JSON string map { customFieldId: value }.
 * We match with `contains` against the JSON-encoded fragment — pragmatic
 * for the lite engine (values are JSON-stringified so quotes anchor matches).
 */
function cfClauseToWhere(c: JqlClause, ctx: JqlContext): Where {
  const cfName = c.field.slice(3).toLowerCase();
  const def = ctx.customFields.find((f) => f.name.toLowerCase() === cfName);
  if (!def) return { id: "__none__" };

  const raw = c.value;
  const v = raw.toLowerCase();
  const not = c.op === "!=";
  const key = `"${def.id}":`;

  // Unset check: value "none"/"empty" → field key absent from the map.
  if (v === "none" || v === "empty") {
    return not
      ? { customFields: { contains: key } }
      : { OR: [{ customFields: null }, { customFields: { not: { contains: key } } }] };
  }

  // Normalize the stored value by field type. The map stores every value
  // as a JSON string (String(value) on write), so the needle is quoted.
  let needle: string;
  if (def.type === "CHECKBOX") {
    if (v !== "true" && v !== "false") return { id: "__none__" };
    needle = `${key}"${v}"`;
  } else if (def.type === "NUMBER") {
    const n = Number(raw);
    if (Number.isNaN(n)) return { id: "__none__" };
    needle = `${key}"${String(n)}"`;
  } else {
    needle = `${key}"${raw}"`;
  }

  if (not) {
    return { OR: [{ customFields: null }, { customFields: { not: { contains: needle } } }] };
  }
  // `~` on TEXT/SELECT/DATE gets prefix matching for free via contains.
  if (c.op === "~" && (def.type === "TEXT" || def.type === "SELECT" || def.type === "DATE")) {
    return { customFields: { contains: `${key}"${raw}` } };
  }
  return { customFields: { contains: needle } };
}

function clauseToWhere(c: JqlClause, ctx: JqlContext): Where {
  if (c.field.startsWith("cf:")) return cfClauseToWhere(c, ctx);
  const field = c.field;
  const raw = c.value;
  const v = raw.toLowerCase();
  const not = c.op === "!=";
  const contains = c.op === "~";

  switch (field) {
    case "status": {
      const ids = ctx.statuses.filter((s) => (contains ? s.name.toLowerCase().includes(v) : s.name.toLowerCase() === v)).map((s) => s.id);
      return ids.length ? { statusId: not ? { notIn: ids } : { in: ids } } : (not ? {} : { id: "__none__" });
    }
    case "type": {
      const ids = ctx.types.filter((t) => (contains ? t.name.toLowerCase().includes(v) : t.name.toLowerCase() === v)).map((t) => t.id);
      return ids.length ? { typeId: not ? { notIn: ids } : { in: ids } } : (not ? {} : { id: "__none__" });
    }
    case "priority": {
      if (v === "none") return { priorityId: not ? { not: null } : null };
      const ids = ctx.priorities.filter((p) => (contains ? p.name.toLowerCase().includes(v) : p.name.toLowerCase() === v)).map((p) => p.id);
      return ids.length ? { priorityId: not ? { notIn: ids } : { in: ids } } : (not ? {} : { id: "__none__" });
    }
    case "assignee":
    case "reporter": {
      const key = field === "assignee" ? "assigneeId" : "reporterId";
      if (v === "none" || v === "unassigned") return { [key]: not ? { not: null } : null };
      const ids = resolveUser(raw, ctx);
      if (ids === null) return { id: "__none__" };
      if (!ids.length) return {}; // anyone → no filter
      return { [key]: not ? { notIn: ids } : { in: ids } };
    }
    case "sprint": {
      if (v === "none" || v === "backlog") return { sprintId: not ? { not: null } : null };
      if (v === "active") return { sprint: { status: "ACTIVE" } };
      if (v === "future") return { sprint: { status: "FUTURE" } };
      if (v === "completed") return { sprint: { status: "COMPLETED" } };
      const ids = ctx.sprints.filter((s) => (contains ? s.name.toLowerCase().includes(v) : s.name.toLowerCase() === v)).map((s) => s.id);
      return ids.length ? { sprintId: not ? { notIn: ids } : { in: ids } } : (not ? {} : { id: "__none__" });
    }
    case "project": {
      const ids = ctx.projects.filter((p) => p.key.toLowerCase() === v || p.name.toLowerCase().includes(v)).map((p) => p.id);
      return ids.length ? { projectId: not ? { notIn: ids } : { in: ids } } : (not ? {} : { id: "__none__" });
    }
    case "summary":
      if (!raw) return {};
      return { summary: contains || c.op === "=" ? { contains: raw } : { not: { contains: raw } } };
    case "description":
      if (!raw) return {};
      return { description: contains ? { contains: raw } : { not: { contains: raw } } };
    case "label": {
      const ids = ctx.labels.filter((l) => l.name.toLowerCase() === v).map((l) => l.id);
      if (!ids.length) return not ? {} : { id: "__none__" };
      return not ? { labels: { none: { labelId: { in: ids } } } } : { labels: { some: { labelId: { in: ids } } } };
    }
    case "points": {
      const n = Number(raw);
      if (Number.isNaN(n)) return {};
      if (not) return { OR: [{ storyPoints: { not: { equals: n } } }, { storyPoints: null }] };
      return { storyPoints: n };
    }
    case "due": {
      if (v === "none") return { dueDate: not ? { not: null } : null };
      if (v === "overdue") return not
        ? { OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }] }
        : { dueDate: { lt: new Date() }, status: { category: { not: "DONE" } } };
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return { dueDate: not ? { not: d } : d };
      return {};
    }
    case "created":
    case "updated": {
      const m = raw.match(/^(\d+)d$/);
      const days = m ? Number(m[1]) : v === "today" ? 1 : null;
      if (days === null) return {};
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const key = field === "created" ? "createdAt" : "updatedAt";
      return not ? { [key]: { lt: since } } : { [key]: { gte: since } };
    }
    default:
      return {};
  }
}

export function buildWhere(node: JqlNode, ctx: JqlContext, base: Where = {}): Where {
  if (node.kind === "clause") {
    return { AND: [base, clauseToWhere(node, ctx)] };
  }
  const parts = node.children.map((c) => buildWhere(c, ctx, {}));
  if (node.op === "AND") return { AND: [base, ...parts] };
  return { AND: [base, { OR: parts }] };
}
