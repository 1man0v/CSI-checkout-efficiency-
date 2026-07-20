# Generate Prototype

## Handling `NEEDS_INPUT`

Before starting the stage, recursively read every file under `requirements/` and find all occurrences of `NEEDS_INPUT`.

For each unresolved item, determine whether it affects the result of the current stage. Do not make a business decision on behalf of the Product Manager or replace a missing answer with a professional assumption.

If at least one unresolved item affects the current stage:

1. create or update `ai-artifacts/needs-input.md`;
2. record the source file and the heading of the unresolved item;
3. formulate a specific question for the Product Manager or client;
4. explain which part of the current stage depends on the answer;
5. stop generating artifacts for the current stage and return the status `NEEDS_INPUT`;
6. ask the questions in the conversation.

After an answer is received:

1. update the original requirement file that contained the relevant `NEEDS_INPUT` block;
2. replace the unresolved text with the confirmed decision;
3. preserve all context related to that decision;
4. mark the item as resolved in `ai-artifacts/needs-input.md`;
5. show the Product Manager which files were changed;
6. continue the stage only after the Product Manager confirms the changes.

List unresolved items that do not affect the current stage as open questions in the report. Do not close them or decide them independently.

## Inputs

* approved requirements;
* `ai-artifacts/01-product.model.json`;
* `ai-artifacts/02-screen.model.json`;
* `ai-artifacts/03-visual-prototype.model.json`;
* `visual-prototype/`;
* `ai-artifacts/06-visual-prototype-report.md`.

## Output language

All human-readable output must be written in Russian.

## Goal

Create a working Prototype connected to a backend, API and database. It must support end-to-end demonstration of the most important product scenarios using realistic, synthetic, anonymized or explicitly approved client data.

Create:

```text
prototype/
ai-artifacts/07-prototype-report.md
```

## Requirements

The Prototype must:

* implement frontend, backend, API and database behavior required for key scenarios;
* follow the approved Visual Prototype;
* apply the main business rules from Product Model;
* provide reproducible database schema and seed data;
* use safe test integrations or controlled mocks;
* include clear run, reset and configuration instructions;
* document all prototype-only shortcuts and limitations;
* avoid secrets and unauthorized personal data.

## Scope rules

Implement only what is needed to validate the product and its key scenarios.

Do not:

* claim production readiness;
* optimize for production scale unless necessary for the hypothesis;
* treat prototype architecture as final architecture;
* start final product implementation;
* generate the production system that belongs to GitHub Spec Kit and Feature SDD.

## Verification

Verify:

* frontend, backend, API and database start successfully;
* database schema and seed data can be recreated;
* key scenarios work end to end;
* data is persisted and displayed correctly;
* the interface matches the approved Visual Prototype;
* implemented business rules match Product Model;
* security and data limitations are documented;
* the result can be demonstrated without hidden manual steps.

## Report

Create `ai-artifacts/07-prototype-report.md` in Russian with:

* implemented scenarios;
* implemented data model, API and backend behavior;
* data source and safety notes;
* run and reset instructions;
* deviations from the Visual Prototype;
* simplifications and known limitations;
* validation questions;
* readiness status.

Final status must be one of:

```text
READY_FOR_CLIENT_DEMO
BLOCKED_FOR_CLIENT_DEMO
```
