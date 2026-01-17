#!/bin/bash

# Extract all relative imports from TypeScript files
echo "# Import Analysis - All Files" > docs/analysis/all-imports.txt
echo "# Generated: $(date)" >> docs/analysis/all-imports.txt
echo "" >> docs/analysis/all-imports.txt

for file in $(find src -type f \( -name "*.ts" -o -name "*.tsx" \)); do
    echo "## $file" >> docs/analysis/all-imports.txt
    # Extract import statements with relative paths (./ or ../ or @/)
    grep -E "from ['\"](\./|\.\./|@/)" "$file" >> docs/analysis/all-imports.txt 2>/dev/null || echo "  (no relative imports)" >> docs/analysis/all-imports.txt
    echo "" >> docs/analysis/all-imports.txt
done

echo "Import extraction complete"
