import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const configPath = path.join(root, "quality", "maintainability.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const budgets = config.budgets;
const legacyFiles = Object.fromEntries(
  Object.entries(config.legacyFiles ?? {}).map(([filePath, value]) => [
    filePath,
    typeof value === "number" ? { maxLines: value, skipFunctionBudgets: true } : value
  ])
);
const ignoredDirs = new Set(config.ignoredDirs ?? []);
const extensions = new Set(config.extensions ?? [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

const issues = [];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function isIgnored(relPath) {
  const parts = relPath.split("/");
  return parts.some((part) => ignoredDirs.has(part));
}

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = toPosix(path.relative(root, absPath));

    if (isIgnored(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectFiles(absPath));
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(absPath);
    }
  }

  return files;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function getNodeName(node) {
  if (node.name) {
    return node.name.getText();
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.name) {
    return parent.name.getText();
  }

  if (parent && ts.isPropertyAssignment(parent) && parent.name) {
    return parent.name.getText();
  }

  if (parent && ts.isExportAssignment(parent)) {
    return "default";
  }

  return "<anonymous>";
}

function isNestingNode(node) {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  );
}

function getMaxNestingDepth(rootNode) {
  let maxDepth = 0;

  function visit(node, depth) {
    if (node !== rootNode && isFunctionLike(node)) {
      return;
    }

    const nextDepth = depth + (isNestingNode(node) ? 1 : 0);
    maxDepth = Math.max(maxDepth, nextDepth);
    ts.forEachChild(node, (child) => visit(child, nextDepth));
  }

  visit(rootNode, 0);
  return maxDepth;
}

function checkFile(absPath) {
  const relPath = toPosix(path.relative(root, absPath));
  const sourceText = fs.readFileSync(absPath, "utf8");
  const lineCount = sourceText.split(/\r?\n/).length;
  const legacy = legacyFiles[relPath];

  if (lineCount > budgets.maxFileLines) {
    if (!legacy) {
      issues.push(`${relPath}: ${lineCount} lines exceeds maxFileLines=${budgets.maxFileLines}`);
    } else if (lineCount > legacy.maxLines) {
      issues.push(`${relPath}: ${lineCount} lines exceeds legacy ceiling=${legacy.maxLines}`);
    }
  }

  if (legacy?.skipFunctionBudgets) {
    return;
  }

  const sourceFile = ts.createSourceFile(absPath, sourceText, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (isFunctionLike(node)) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
      const functionLines = end.line - start.line + 1;
      const params = node.parameters?.length ?? 0;
      const nesting = getMaxNestingDepth(node);
      const name = getNodeName(node);
      const location = `${relPath}:${start.line + 1} ${name}`;

      if (functionLines > budgets.maxFunctionLines) {
        issues.push(`${location}: ${functionLines} lines exceeds maxFunctionLines=${budgets.maxFunctionLines}`);
      }

      if (params > budgets.maxFunctionParams) {
        issues.push(`${location}: ${params} parameters exceeds maxFunctionParams=${budgets.maxFunctionParams}`);
      }

      if (nesting > budgets.maxNestingDepth) {
        issues.push(`${location}: nesting depth ${nesting} exceeds maxNestingDepth=${budgets.maxNestingDepth}`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

for (const file of collectFiles(root)) {
  checkFile(file);
}

if (issues.length > 0) {
  console.error("Maintainability gate failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Maintainability gate passed.");
