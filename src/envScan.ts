import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".example.env");

type EnvType =
  | "String"
  | "Boolean"
  | "Integer"
  | "Strings";

interface EnvInfo {
  optional?: boolean;
  type: EnvType;
}

const envs = new Map<string, EnvInfo>();

function walk(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "build" ||
      entry.name === ".next"
    )
      continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (
      /\.(ts|tsx|mts|cts)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(full);
    }
  }

  return files;
}

function ensure(name: string) {
  if (!envs.has(name)) {
    envs.set(name, {
      type: "String",
    });
  }
  return envs.get(name)!;
}

function markOptional(name: string, optional: boolean) {
  ensure(name).optional = optional;
}

function markType(name: string, type: EnvType) {
  const info = ensure(name);

  const priority = {
    String: 0,
    Strings: 1,
    Boolean: 2,
    Integer: 3,
  };

  if (priority[type] > priority[info.type]) {
    info.type = type;
  }
}

function getEnvName(node: ts.Node): string | undefined {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    if (
      node.expression.expression.getText() === "process" &&
      node.expression.name.text === "env"
    ) {
      return node.name.text;
    }
  }

  if (
    ts.isElementAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    if (
      node.expression.expression.getText() === "process" &&
      node.expression.name.text === "env"
    ) {
      const arg = node.argumentExpression;
      if (arg && ts.isStringLiteral(arg)) {
        return arg.text;
      }
    }
  }

  return;
}

function inspect(file: string) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );

  function visit(node: ts.Node) {
    const env = getEnvName(node);

    if (env) {
      ensure(env);

      const parent = node.parent;

      if (ts.isCallExpression(parent)) {
        const fn = parent.expression.getText();

        if (
          fn === "parseInt" ||
          fn === "parseFloat" ||
          fn === "Number" ||
          fn === "BigInt"
        ) {
          markType(env, "Integer");
        }

        if (fn === "Boolean") {
          markType(env, "Boolean");
        }
      }

      if (ts.isBinaryExpression(parent)) {
        const right = parent.right.getText().replace(/['"]/g, "");

        if (right === "true" || right === "false") {
          markType(env, "Boolean");
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === "checkEnvs"
    ) {
      const [nameArg, optionalArg] = node.arguments;

      if (
        nameArg &&
        optionalArg &&
        ts.isStringLiteral(nameArg) &&
        (optionalArg.kind === ts.SyntaxKind.TrueKeyword ||
          optionalArg.kind === ts.SyntaxKind.FalseKeyword)
      ) {
        markOptional(
          nameArg.text,
          optionalArg.kind === ts.SyntaxKind.TrueKeyword
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

for (const file of walk(ROOT)) {
  inspect(file);
}

const existing = new Map<string, string>();

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=/.exec(line);

    if (match) {
      existing.set(match[1] ?? "unknown", line);
    }
  }
}

for (const [name, info] of envs) {
  const optional = info.optional ? "Optional " : "";
  existing.set(name, `${name}= # ${optional}${info.type}`.trim());
}

const output = [...existing.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, line]) => line)
  .join("\n");

fs.writeFileSync(ENV_FILE, output + "\n");

console.log(`Updated ${ENV_FILE} (${existing.size} variables)`);