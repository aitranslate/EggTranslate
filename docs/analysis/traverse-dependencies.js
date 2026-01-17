/**
 * Dependency Traversal Script
 * Analyzes import statements in TypeScript/React files to build dependency graph
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SRC_DIR = path.join(__dirname, '../../src');
const OUTPUT_DIR = path.join(__dirname, '../analysis');

// Results
const reachableFiles = new Set();
const traversalLog = [];
const dynamicImports = [];

// File extensions to analyze
const extensions = ['.ts', '.tsx'];

// Helper: Extract imports from file content
function extractImports(filePath, content) {
  const imports = [];

  // Match: import ... from '...'
  // Match: import ... from "@/..."
  // Match: import ... from './...'
  // Match: import ... from "../..."

  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s+from\s+['"](@\/[^'"]+|[.^][^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const resolvedPath = resolveImportPath(filePath, importPath);
    if (resolvedPath) {
      imports.push({
        from: filePath,
        to: resolvedPath,
        raw: importPath
      });
    }
  }

  // Check for dynamic imports
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    dynamicImports.push({
      file: filePath,
      path: match[1]
    });
  }

  return imports;
}

// Helper: Resolve import path to file path
function resolveImportPath(fromFile, importPath) {
  // Skip node_modules and built-ins
  if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
    return null;
  }

  let resolvedPath;

  if (importPath.startsWith('@/')) {
    // Alias import: @/ is src/
    const relativePath = importPath.substring(2);
    resolvedPath = path.join(SRC_DIR, relativePath);
  } else {
    // Relative import
    const fromDir = path.dirname(fromFile);
    resolvedPath = path.join(fromDir, importPath);
  }

  // Try different extensions
  for (const ext of extensions) {
    const filePath = resolvedPath + ext;
    if (fs.existsSync(filePath)) {
      return path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
    }
  }

  // Try index files
  for (const ext of extensions) {
    const indexPath = path.join(resolvedPath, 'index' + ext);
    if (fs.existsSync(indexPath)) {
      return path.relative(SRC_DIR, indexPath).replace(/\\/g, '/');
    }
  }

  return null;
}

// Helper: Recursively traverse dependencies
function traverseDependencies(filePath, visited = new Set(), depth = 0) {
  const fullPath = path.join(SRC_DIR, filePath);

  if (visited.has(filePath)) {
    return;
  }

  visited.add(filePath);
  reachableFiles.add(filePath);

  if (!fs.existsSync(fullPath)) {
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const imports = extractImports(filePath, content);

  for (const imp of imports) {
    const relativePath = path.relative(SRC_DIR, imp.to).replace(/\\/g, '/');
    const indent = '  '.repeat(depth);

    traversalLog.push(`${indent}${filePath} -> ${relativePath}`);

    traverseDependencies(relativePath, visited, depth + 1);
  }
}

// Main execution
function main() {
  console.log('Starting dependency traversal...\n');

  // Entry points (tier 0)
  const entryPoints = [
    'main.tsx',
    'App.tsx',
    'components/MainApp.tsx',
    'contexts/TermsContext.tsx',
    'contexts/HistoryContext.tsx'
  ];

  // Traverse from each entry point
  for (const entry of entryPoints) {
    console.log(`Traversing from: ${entry}`);
    traverseDependencies(entry);
  }

  // Write results
  console.log('\nWriting results...');

  // Write reachable files
  const reachablePath = path.join(OUTPUT_DIR, 'reachable-files.txt');
  const existingContent = fs.existsSync(reachablePath)
    ? fs.readFileSync(reachablePath, 'utf-8')
    : '';

  const tier1Files = [...reachableFiles].filter(f =>
    !entryPoints.some(e => f === e || f.endsWith(e))
  ).sort();

  fs.writeFileSync(
    reachablePath,
    existingContent +
    '\n\n# Tier 1 - Direct Dependencies\n' +
    '# Files imported directly by entry points\n' +
    `# Generated: ${new Date().toISOString()}\n\n` +
    tier1Files.map(f => `src/${f}`).join('\n')
  );

  // Write traversal log
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'traversal-log.txt'),
    '# Traversal Log\n' +
    '# Format: SOURCE_FILE -> TARGET_FILE\n' +
    `# Generated: ${new Date().toISOString()}\n\n` +
    traversalLog.join('\n')
  );

  // Write dynamic imports
  if (dynamicImports.length > 0) {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'dynamic-imports.txt'),
      '# Dynamic Imports\n' +
      '# Files using dynamic import() syntax\n' +
      `# Generated: ${new Date().toISOString()}\n\n` +
      dynamicImports.map(d => `${d.file}: ${d.path}`).join('\n')
    );
  } else {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'dynamic-imports.txt'),
      '# Dynamic Imports\n' +
      '# No dynamic imports found\n' +
      `# Generated: ${new Date().toISOString()}\n`
    );
  }

  console.log('\n✅ Traversal complete!');
  console.log(`   Total reachable files: ${reachableFiles.size}`);
  console.log(`   Traversal log entries: ${traversalLog.length}`);
  console.log(`   Dynamic imports: ${dynamicImports.length}`);
  console.log(`   Tier 1 files discovered: ${tier1Files.length}`);
}

main();
