---
name: demo-vibecoding-spec-generator
description: Create concise, dependency-aware `*.spec.md` development documents from user-provided requirement, architecture, API, database, and security docs for demo vibecoding projects. Use when Codex needs to split implementation work into clear module specs, keep task order consistent with dependencies, avoid duplicate or missing steps, and create `AGENTS.md` when the project root does not have one. Do not generate specs from repository docs alone when the source-of-truth version or business background is unclear.
---

# Demo Vibecoding Spec Generator

## Overview

Use this skill to turn a small set of project documents into short, execution-ready `*.spec.md` files for Codex-driven development.

Prefer explicit user-provided document paths and explicit business background.
Repository scanning is only for finding candidates, not for deciding the source of truth.

Keep outputs short. Do not turn the result into a long analysis report.

## Workflow

1. Resolve authoritative inputs.
Require the user to provide or confirm:
- authoritative requirement docs
- authoritative design or architecture docs
- key business background and scope
- version baseline when multiple docs exist

If the user did not provide these, do not generate specs yet.
At most, run the discovery script to list candidates:

```bash
python skills/demo-vibecoding-spec-generator/scripts/discover_spec_inputs.py --project-root .
```

If multiple candidate docs of the same type exist, or versions conflict, stop and ask the user which files are authoritative.

2. Build a module map.
Extract business modules and shared concerns from headings and key sections.
Separate runtime modules from shared governance concerns.

3. Split work into specs.
Create one `specs/00-overall-plan.spec.md` and a small set of module specs.
Keep one primary responsibility boundary per spec.
Move shared rules such as API conventions, security baseline, release gates, and collaboration rules into a governance spec instead of repeating them everywhere.

4. Write execution-ready tasks.
For each spec, keep tasks small enough for Codex to implement directly.
Each task must include:
- goal
- inputs
- outputs
- dependencies
- implementation notes
- acceptance criteria

5. Create or update `AGENTS.md`.
If the project root has no `AGENTS.md`, create one from `references/agents-template.md`.
If it already exists, keep the user's rules and only add missing governance sections when necessary.

6. Run a final check.
Before finishing, verify:
- every major requirement maps to at least one spec
- every module has a clear owner spec
- no two specs own the same implementation work
- the dependency order is buildable
- shared rules are not copy-pasted into multiple specs
- the output is based on user-confirmed source-of-truth docs instead of guessed repo files

## Output Rules

- Follow `references/output-contract.md` for `*.spec.md` file naming and section order.
- Prefer 3-6 tasks per module spec.
- Keep each task concrete enough to implement without further planning.
- Prefer short bullets over long prose.
- Do not copy large blocks from source documents.
- Do not create extra checklist, roadmap, or summary files unless the user explicitly asks.
- Do not generate specs when business background, authoritative version, or scope is not confirmed.

## Resources

- `scripts/discover_spec_inputs.py`
Use this to find candidate input docs and detect whether root `AGENTS.md` exists.

- `references/output-contract.md`
Use this for spec file naming, section order, and de-duplication rules.

- `references/agents-template.md`
Use this as the baseline when the project root has no `AGENTS.md`.
