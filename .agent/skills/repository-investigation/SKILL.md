# Skill: Repository Investigation

## Purpose

Systematically explore and understand a codebase to build accurate mental models for subsequent work.

## When to Use

- First time in a repository
- Before making changes to unfamiliar areas
- When debugging unknown issues
- When documentation may be outdated

## Procedure

### 1. Structure Discovery

```bash
# Complete file tree (excluding .git)
find . -type f -not -path "./.git/*" | sort

# Key directories
ls -la
```

### 2. Entry Points

```bash
# Find main entry points
ls *.html *.json *.yaml *.yml 2>/dev/null
cat package.json 2>/dev/null || echo "No package.json"
```

### 3. Configuration Files

```bash
# Read all config files
cat .gitignore
cat .github/workflows/*.yml 2>/dev/null
cat *.config.* 2>/dev/null
```

### 4. Source Code Mapping

```bash
# Language-specific
find . -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.rs" | head -20
find . -name "*.css" -o -name "*.scss" -o -name "*.less" | head -10
```

### 5. Dependency Analysis

```bash
# Package managers
cat package.json 2>/dev/null | jq .dependencies,.devDependencies
cat requirements.txt 2>/dev/null
cat go.mod 2>/dev/null
cat Cargo.toml 2>/dev/null
```

### 6. Git History

```bash
# Recent context
git log --oneline -20
git log --oneline --all --graph | head -30
```

### 7. Documentation Scan

```bash
# Find all docs
find . -name "*.md" -not -path "./.git/*" | sort
cat README.md
```

### 8. Build/Deploy Scripts

```bash
# CI/CD
cat .github/workflows/*.yml 2>/dev/null
cat .gitlab-ci.yml 2>/dev/null
cat Jenkinsfile 2>/dev/null
```

## Output Format

Produce a structured summary:

```markdown
## Repository Investigation Report

### Basics
- **Name**: 
- **Purpose**: 
- **Language(s)**: 
- **Framework(s)**: 
- **Build Tool**: 

### Structure
- **Entry Points**: 
- **Key Directories**: 
- **Config Files**: 

### Dependencies
- **Runtime**: 
- **Dev**: 

### Architecture
- **Patterns**: 
- **Data Flow**: 
- **External Systems**: 

### Operations
- **CI/CD**: 
- **Deploy**: 
- **Secrets**: 

### Gaps
- **Missing Docs**: 
- **Outdated Info**: 
- **Unknown Areas**: 
```

## Athmetry-Specific

For this repository, focus on:
- `index.html` → `js/app.js` → `js/api.js` + `js/dashboard.js`
- `.github/workflows/collect-status.yml` → `.github/scripts/collect-status.sh`
- `.github/workflows/deploy-pages.yml`
- `css/style.css` (theme variables, responsive)
- `data/status.json` (data contract)

## Tools

- `bash` (find, cat, grep, jq)
- `git` (log, status, diff)
- Editor search (ripgrep recommended)

## Anti-Patterns

- ❌ Assuming structure without verifying
- ❌ Reading only README
- ❌ Skipping config files
- ❌ Not checking git history
- ❌ Assuming docs are current