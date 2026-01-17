# Dead Code Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Identify and remove all unused TypeScript/TSX files from the codebase using manual call chain analysis to optimize bundle size and improve maintainability.

**Architecture:** Reverse-tracing approach starting from all business entry points (main.tsx, App.tsx), following import dependencies to build a complete reachability graph, then removing files not in the execution path.

**Tech Stack:**
- TypeScript compiler (`npx tsc --noEmit`) for type validation
- Grep for static import analysis
- Git for version control and rollback safety

---

## Task 1: Build Complete File Inventory

**Files:**
- Create: `docs/analysis/file-inventory.txt`
- Create: `docs/analysis/file-categories.json`

**Step 1: Create analysis directory**

```bash
mkdir -p docs/analysis
```

Expected: Directory created successfully

**Step 2: Generate complete file list**

```bash
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "*/node_modules/*" | sort > docs/analysis/file-inventory.txt
```

Expected: File created with sorted list of all .ts/.tsx files

**Step 3: Categorize files by directory**

```bash
cat > docs/analysis/file-categories.json << 'EOF'
{
  "components": [],
  "services": [],
  "utils": [],
  "contexts": [],
  "stores": [],
  "constants": [],
  "hooks": [],
  "types": [],
  "data": []
}
EOF
```

Expected: JSON template created

**Step 4: Populate categories (manual or script)**

```bash
# Example command to populate components array
find src/components -type f \( -name "*.ts" -o -name "*.tsx" \) | sed 's|src/||' > docs/analysis/components.txt

# Repeat for services, utils, contexts, stores, constants, hooks, types, data
```

Expected: Category text files created with relative paths

**Step 5: Review inventory**

```bash
echo "Total TypeScript files:"
wc -l docs/analysis/file-inventory.txt

echo "\nBreakdown by category:"
wc -l docs/analysis/*.txt
```

Expected: Summary statistics showing file count by category (should be ~72 total files based on initial scan)

**Step 6: Commit**

```bash
git add docs/analysis/
git commit -m "chore: create file inventory for dead code analysis"
```

---

## Task 2: Trace Entry Points and Build Dependency Graph

**Files:**
- Create: `docs/analysis/entry-points.txt`
- Create: `docs/analysis/dependency-graph.txt`
- Create: `docs/analysis/reachable-files.txt`

**Step 1: Identify entry points**

```bash
cat > docs/analysis/entry-points.txt << 'EOF'
# Main entry points
src/main.tsx
src/App.tsx
src/components/MainApp.tsx

# Context providers (wrapped in App.tsx)
src/contexts/SubtitleContext.tsx
src/contexts/TranslationContext.tsx
src/contexts/TranscriptionContext.tsx
src/contexts/TermsContext.tsx
src/contexts/HistoryContext.tsx
EOF
```

Expected: Entry points file created

**Step 2: Trace main.tsx dependencies**

```bash
echo "=== src/main.tsx ===" >> docs/analysis/dependency-graph.txt
grep -E "^import" src/main.tsx >> docs/analysis/dependency-graph.txt
echo "" >> docs/analysis/dependency-graph.txt
```

Expected: main.tsx imports logged

**Step 3: Trace App.tsx dependencies**

```bash
echo "=== src/App.tsx ===" >> docs/analysis/dependency-graph.txt
grep -E "^import" src/App.tsx >> docs/analysis/dependency-graph.txt
echo "" >> docs/analysis/dependency-graph.txt
```

Expected: App.tsx imports logged

**Step 4: Trace MainApp.tsx dependencies**

```bash
echo "=== src/components/MainApp.tsx ===" >> docs/analysis/dependency-graph.txt
grep -E "^import" src/components/MainApp.tsx >> docs/analysis/dependency-graph.txt
echo "" >> docs/analysis/dependency-graph.txt
```

Expected: MainApp.tsx imports logged

**Step 5: Create initial reachable files list**

```bash
cat > docs/analysis/reachable-files.txt << 'EOF'
# Entry points (tier 0)
src/main.tsx
src/App.tsx
src/components/MainApp.tsx
EOF
```

Expected: Initial reachable list created with tier 0 files

**Step 6: Mark tier 0 files**

```bash
echo "✅ TIER 0 - Entry Points" >> docs/analysis/reachable-files.txt
```

Expected: Tier marker added

**Step 7: Commit**

```bash
git add docs/analysis/
git commit -m "chore: trace entry points and initial dependencies"
```

---

## Task 3: Recursive Dependency Traversal

**Files:**
- Modify: `docs/analysis/reachable-files.txt`
- Create: `docs/analysis/traversal-log.txt`

**Step 1: Start traversal from tier 0**

```bash
cat > docs/analysis/traversal-log.txt << 'EOF'
# Traversal Log
# Format: SOURCE_FILE -> TARGET_FILE
EOF
```

Expected: Traversal log initialized

**Step 2: Trace main.tsx imports (tier 1)**

```bash
# Extract import paths from main.tsx
grep -oP "(?<=from ')[^']+" src/main.tsx | while read import_path; do
  echo "src/main.tsx -> $import_path" >> docs/analysis/traversal-log.txt
  # Add to reachable if it's a relative import (project file)
  if [[ "$import_path" == ./* ]]; then
    echo "src/${import_path#./}" | sed 's|.tsx*$||.tsx|' >> docs/analysis/reachable-files.txt
  fi
done
```

Expected: main.tsx dependencies logged and marked reachable

**Step 3: Manually trace App.tsx imports**

Read `src/App.tsx` and extract all imports:
```bash
echo "# TIER 1 - Direct App.tsx dependencies" >> docs/analysis/reachable-files.txt

# List all files imported by App.tsx manually
grep -E "^import" src/App.tsx | sed 's/.*from //' | sed "s/'//g" | sed 's/;//' | while read path; do
  if [[ "$path" == ./* ]]; then
    resolved_path="src/${path#./}"
    echo "$resolved_path" >> docs/analysis/reachable-files.txt
    echo "src/App.tsx -> $resolved_path" >> docs/analysis/traversal-log.txt
  fi
done
```

Expected: App.tsx direct dependencies added

**Step 4: Trace MainApp.tsx component dependencies**

```bash
echo "# TIER 1 - MainApp.tsx component dependencies" >> docs/analysis/reachable-files.txt

grep -E "^import.*from.*\./" src/components/MainApp.tsx | sed 's/.*from //' | sed "s/'//g" | sed 's/;//' | sort -u | while read path; do
  resolved_path="src/components/${path#./}"
  echo "$resolved_path" | sed 's|.tsx*$||.tsx|' >> docs/analysis/reachable-files.txt
  echo "src/components/MainApp.tsx -> $resolved_path" >> docs/analysis/traversal-log.txt
done
```

Expected: MainApp component dependencies added

**Step 5: Trace Context providers**

For each Context file in entry-points.txt:
```bash
for context_file in src/contexts/*.tsx; do
  echo "# Tracing $context_file" >> docs/analysis/traversal-log.txt
  grep -E "^import.*from.*\./" "$context_file" | sed 's/.*from //' | sed "s/'//g" | sed 's/;//' | while read path; do
    if [[ "$path" == ./* ]]; then
      resolved_path="${context_file%/*}/${path#./}"
      echo "$resolved_path" | sed 's|.tsx*$||.tsx|' >> docs/analysis/reachable-files.txt
      echo "$context_file -> $resolved_path" >> docs/analysis/traversal-log.txt
    fi
  done
done
```

Expected: Context dependencies logged

**Step 6: Check for dynamic imports**

```bash
echo "# Checking for dynamic imports (React.lazy, import())" >> docs/analysis/traversal-log.txt

grep -r "React.lazy\|import(" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules >> docs/analysis/dynamic-imports.txt || echo "No dynamic imports found" > docs/analysis/dynamic-imports.txt
```

Expected: Dynamic imports identified

**Step 7: Commit**

```bash
git add docs/analysis/
git commit -m "chore: complete initial dependency traversal"
```

---

## Task 4: Trace Service and Utility Layers

**Files:**
- Modify: `docs/analysis/reachable-files.txt`
- Create: `docs/analysis/service-dependencies.txt`
- Create: `docs/analysis/util-dependencies.txt

**Step 1: Trace all service files**

For each file in reachable-files.txt that is a component:
```bash
# Find all component files in reachable list
grep "src/components/" docs/analysis/reachable-files.txt | while read component; do
  if [ -f "$component" ]; then
    echo "=== $component ===" >> docs/analysis/service-dependencies.txt
    # Extract service imports
    grep -E "^import.*from.*\./.*services/" "$component" | sed 's/.*from //' | sed "s/'//g" | sed 's/;//' >> docs/analysis/service-dependencies.txt || true
  fi
done
```

Expected: Service dependencies extracted from components

**Step 2: Trace service-to-service dependencies**

```bash
for service in src/services/**/*.ts; do
  if [ -f "$service" ]; then
    echo "=== $service ===" >> docs/analysis/service-dependencies.txt
    grep -E "^import.*from.*\./" "$service" | sed 's/.*from //' | sed "s/'//g" | sed 's/;//' >> docs/analysis/service-dependencies.txt || true
  fi
done
```

Expected: Service internal dependencies logged

**Step 3: Add all used services to reachable**

```bash
# Extract unique service paths
grep -oP "src/services/[^\']+" docs/analysis/service-dependencies.txt | sort -u | while read service; do
  echo "$service" | sed 's|.tsx*$||.ts|' >> docs/analysis/reachable-files.txt
done
```

Expected: All referenced services marked reachable

**Step 4: Trace utility dependencies**

```bash
for util_file in src/utils/*.ts; do
  if [ -f "$util_file" ]; then
    # Check if any reachable file imports this util
    if grep -r "from.*$(basename $util_file | sed 's/.ts$//')" $(cat docs/analysis/reachable-files.txt | grep -v "^#") --include="*.ts" --include="*.tsx" >/dev/null 2>&1; then
      echo "$util_file" >> docs/analysis/reachable-files.txt
    fi
  fi
done
```

Expected: Used utilities marked reachable

**Step 5: Trace DataManager submodules**

```bash
echo "# DataManager modules" >> docs/analysis/reachable-files.txt
ls src/services/dataManager/modules/*.ts | while read module; do
  echo "$module" >> docs/analysis/reachable-files.txt
done
```

Expected: DataManager modules included (all used by barrel export)

**Step 6: Commit**

```bash
git add docs/analysis/
git commit -m "chore: trace service and utility layer dependencies"
```

---

## Task 5: Identify Candidate Files for Removal

**Files:**
- Create: `docs/analysis/candidates.txt`
- Create: `docs/analysis/verified-unused.txt`

**Step 1: Generate candidate list**

```bash
# Find files in inventory but not in reachable
cat > docs/analysis/candidates.txt << 'EOF'
# Candidate files for removal (present in inventory but not in reachable)
EOF

comm -23 <(sort docs/analysis/file-inventory.txt) <(sort docs/analysis/reachable-files.txt | grep "^src/") >> docs/analysis/candidates.txt
```

Expected: Candidate files listed

**Step 2: Count candidates**

```bash
echo "Total candidates:" >> docs/analysis/candidates.txt
wc -l docs/analysis/candidates.txt >> docs/analysis/candidates.txt
```

Expected: Candidate count documented

**Step 3: Manual verification - check each candidate**

For each candidate file in `docs/analysis/candidates.txt`:

```bash
# Create verification script
cat > scripts/verify-unused.sh << 'EOF'
#!/bin/bash
file="$1"
basename=$(basename "$file" | sed 's/\.(ts|tsx)$//')
echo "=== Verifying: $file ==="

# Check for any import by filename
echo "1. Checking imports by filename..."
grep -r "from.*$basename" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules || echo "  No imports found"

# Check for any import by full path
echo "2. Checking imports by relative path..."
grep -r "$(echo $file | sed 's|^src/||')" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules || echo "  No imports found"

# Check for dynamic import strings
echo "3. Checking dynamic imports..."
grep -r "\".*$basename\"" src/ --include="*.ts" --include="*.tsx" | grep import || echo "  No dynamic imports found"

echo ""
EOF

chmod +x scripts/verify-unused.sh
```

Expected: Verification script created

**Step 4: Run verification for all candidates**

```bash
mkdir -p docs/analysis/verification

while read candidate; do
  if [[ "$candidate" =~ ^src/ ]]; then
    scripts/verify-unused.sh "$candidate" > "docs/analysis/verification/$(basename $candidate).log"
  fi
done < docs/analysis/candidates.txt
```

Expected: Individual verification logs created

**Step 5: Review verification results**

```bash
# Find files with NO references (confirmed unused)
grep -l "No imports found" docs/analysis/verification/*.log | sed 's|.*/||' | sed 's/.log$//' | while read filename; do
  # Find full path
  grep "$filename" docs/analysis/candidates.txt
done > docs/analysis/confirmed-unused.txt
```

Expected: Confirmed unused files listed

**Step 6: Commit**

```bash
git add docs/analysis/ scripts/
git commit -m "chore: identify and verify candidate files for removal"
```

---

## Task 6: Validate and Remove Unused Files

**Files:**
- Delete: (files from confirmed-unused.txt)
- Create: `docs/analysis/removal-report.md`

**Step 1: Create cleanup branch**

```bash
git checkout -b cleanup/dead-code-removal
```

Expected: New branch created

**Step 2: Final safety check - run TypeScript**

```bash
npx tsc --noEmit
```

Expected: No type errors (baseline verification)

**Step 3: Remove confirmed unused files**

```bash
# Read confirmed-unused.txt and remove each file
while read filepath; do
  if [[ "$filepath" =~ ^src/ ]] && [ -f "$filepath" ]; then
    echo "Removing: $filepath"
    rm "$filepath"
  fi
done < docs/analysis/confirmed-unused.txt
```

Expected: Unused files deleted

**Step 4: Verify no broken imports**

```bash
npx tsc --noEmit
```

Expected: Still no type errors (if errors appear, rollback and investigate)

**Step 5: Run build**

```bash
pnpm build
```

Expected: Build succeeds without errors

**Step 6: Generate removal report**

```bash
cat > docs/analysis/removal-report.md << 'EOF'
# Dead Code Removal Report

**Date:** $(date +%Y-%m-%d)
**Branch:** cleanup/dead-code-removal
**Base Commit:** $(git rev-parse --short HEAD)

## Summary

Total files analyzed: $(wc -l < docs/analysis/file-inventory.txt)
Reachable files identified: $(grep -c "^src/" docs/analysis/reachable-files.txt)
Candidates for removal: $(grep -c "^src/" docs/analysis/candidates.txt)
Confirmed unused and removed: $(wc -l < docs/analysis/confirmed-unused.txt)

## Removed Files

$(cat docs/analysis/confirmed-unused.txt)

## Verification Results

✅ TypeScript compilation: PASSED
✅ Production build: PASSED
✅ No broken imports: VERIFIED

## Notes

- All removals verified through dependency graph analysis
- No dynamic imports found referencing removed files
- Barrel exports (index.ts) preserved where needed
EOF
```

Expected: Removal report generated

**Step 7: Commit changes**

```bash
git add .
git commit -m "chore: remove dead code

Remove $(wc -l < docs/analysis/confirmed-unused.txt) unused files after manual dependency analysis.

Verified:
- No broken imports (TypeScript compilation clean)
- Production build successful
- No dynamic import references

See docs/analysis/removal-report.md for details."
```

Expected: Cleanup commit created

**Step 8: Merge to main**

```bash
git checkout main
git merge cleanup/dead-code-removal
```

Expected: Clean merge with no conflicts

---

## Task 7: Optional - Review Preserved Candidates

**Files:**
- Create: `docs/analysis/preserved-files-analysis.md`

**Step 1: Identify candidates that were NOT removed**

```bash
comm -23 <(sort docs/analysis/candidates.txt | grep "^src/") <(sort docs/analysis/confirmed-unused.txt) > docs/analysis/preserved-candidates.txt
```

Expected: Preserved candidate files listed

**Step 2: Analyze why each was preserved**

For each preserved file, manually determine reason:
- Referenced in configuration?
- Used by barrel export?
- Conditional but potentially reachable?

```bash
cat > docs/analysis/preserved-files-analysis.md << 'EOF'
# Preserved Candidate Files Analysis

## Files Not Removed

$(cat docs/analysis/preserved-candidates.txt)

## Reasons for Preservation

[Manual review required for each file]
EOF
```

Expected: Analysis template created

**Step 3: Document findings**

Add manual analysis for each preserved file explaining why it was kept.

**Step 4: Commit**

```bash
git add docs/analysis/
git commit -m "docs: document preserved candidate files analysis"
```

---

## Execution Notes

### Prerequisites
- Git repository initialized
- Node.js and pnpm installed
- TypeScript project builds successfully
- All 72 TypeScript files present

### Expected Outcomes
- Complete dependency graph of the codebase
- Clear list of unused files with verification
- Reduced bundle size
- Improved codebase maintainability

### Risk Mitigation
- All analysis done on separate branch
- TypeScript compiler validates no broken imports
- Production build confirms runtime safety
- Can rollback immediately if issues found

### Time Estimates
- Task 1: 10 minutes (file inventory)
- Task 2: 15 minutes (entry point tracing)
- Task 3: 30 minutes (recursive traversal)
- Task 4: 20 minutes (service/util tracing)
- Task 5: 30 minutes (candidate verification)
- Task 6: 20 minutes (removal and validation)
- Task 7: 15 minutes (preserved file analysis)
- **Total: ~2.5 hours**
