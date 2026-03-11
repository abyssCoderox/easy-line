# Output Contract

## Default Files

- `specs/00-overall-plan.spec.md`
- `specs/10-<module>.spec.md`
- `specs/20-<module>.spec.md`
- `specs/30-<module>.spec.md`
- `specs/40-governance.spec.md`

Create fewer files when the project is small. Do not split by file count alone.
Do not generate these files until the user has confirmed the authoritative source documents and business background.

## Required Sections

Each module spec should contain:

1. `目标与边界`
2. `关联文档`
3. `模块依赖`
4. `任务拆分`
5. `验收与测试`
6. `风险与回退`

`specs/00-overall-plan.spec.md` should contain:

1. source docs
2. module split
3. dependency order
4. spec index
5. coverage summary

## Task Rules

Each task must state:

- goal
- inputs
- outputs
- dependencies
- implementation notes
- acceptance criteria

## De-duplication Rules

- Keep shared API rules in one place.
- Keep shared security rules in one place.
- Keep shared release and collaboration rules in governance docs or `AGENTS.md`.
- Do not repeat the same implementation task in multiple specs.
