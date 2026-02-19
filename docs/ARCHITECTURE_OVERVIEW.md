# Documentation Architecture

This repository uses a layered documentation structure:

## 1) Root Context
- `CURSOR_PROJECT_CONTEXT.md`: single source of truth for product and rules.

## 2) Business and Technical Rules
- `docs/BUSINESS_RULES.md`: product behavior and workflow constraints.
- `docs/TECH_RULES.md`: technical constraints and non-negotiables.
 - `docs/TECH_STACK.md`: MVP1 stack and hosting choices.

## 3) Domain-Specific Specs
- `docs/content_model_icse_grade_9_history_civics.md`: subject content model
  (ICSE Grade 10 History & Civics).
- `docs/PAPER_TEMPLATE_ENGINE.md`: admin template engine rules.
 - `docs/RAPIDFIRE_RULES.md`: RapidFire session rules.
 - `docs/student_journeys.md`: student journeys and handoff flow.
 - `docs/DB_SCHEMA.md`: Postgres DDL for MVP1.
 - `docs/ADMIN_UPLOAD_SCHEMA.md`: chapter-wise XLSX schema.
 - `docs/API_SPEC_MVP1.md`: MVP1 API endpoints.
 - `docs/DATA_INTAKE_STRATEGY.md`: content intake workflow.
 - `docs/flows/parent_flows.mmd`: Mermaid parent flows.
 - `docs/flows/student_flows.mmd`: Mermaid student flows.
 - `docs/flows/admin_flows.mmd`: Mermaid admin flows.

## 4) Content Model Naming Convention
Use one content model file per board, grade, and subject:
- `docs/content_model_<board>_grade_<grade>_<subject>.md`
- Example: `docs/content_model_icse_grade_9_history_civics.md`

## 5) Cursor Advisory Rules
- `.cursor/rules/*.mdc`: lightweight guidance that points back to the docs.

Note: Cursor rules should warn and ask for permission before deviating from
documented constraints.
