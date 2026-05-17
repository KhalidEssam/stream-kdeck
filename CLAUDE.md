# Claude Code Rules

## Search Strategy

Prefer tools in this order:

1. LSP/indexed navigation
   - find definition
   - find references
   - rename symbol
   - implementation lookup
   - type-aware navigation

2. ripgrep (`rg`)
   - text search
   - env variables
   - CSS classes
   - routes
   - TODO/FIXME
   - filenames

3. ast-grep (`sg`)
   - structural code search
   - React hooks
   - async functions
   - imports
   - JSX patterns

Avoid classic grep unless explicitly requested.

---

## Before Editing

Before major refactors:

1. Inspect related files first
2. Explain architecture briefly
3. Search references before modifying shared code
4. Avoid duplicate implementations

---

## React / Next.js Rules

- Prefer reusable components
- Prefer TypeScript-safe patterns
- Avoid unnecessary re-renders
- Keep components small
- Prefer composition over prop drilling

---

## Backend Rules

- Validate inputs
- Handle async errors properly
- Avoid duplicated business logic
- Prefer service abstraction

---

## Output Style

- Keep explanations concise
- Show exact file paths being edited
- Explain risks before destructive changes
