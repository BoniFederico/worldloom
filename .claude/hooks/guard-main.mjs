// PreToolUse hook: blocca `git commit` e `git push` mentre si è sul branch main/master.
// Exit code 2 = blocca la chiamata e mostra stderr all'agente.
import { execSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let command = "";
try {
  command = JSON.parse(raw)?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

if (!/\bgit\s+(commit|push)\b/.test(command)) process.exit(0);

let branch = "";
try {
  branch = execSync("git symbolic-ref --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch {
  process.exit(0); // non è un repo git (o nessun commit): non bloccare
}

if (branch === "main" || branch === "master") {
  console.error(
    `Bloccato: sei su '${branch}'. Crea un branch (git switch -c feat/<slug>) e apri una PR.`
  );
  process.exit(2);
}
process.exit(0);
