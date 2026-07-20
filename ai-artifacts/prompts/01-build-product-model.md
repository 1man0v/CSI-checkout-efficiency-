# Build Product Model

You are acting as a Product Compiler.

Workspace contains:

* Product requirements repository.
* UI kit package or local UI kit sources with existing UI components, if present.

Goal:
Build a machine-readable Product Model from requirements.

Do NOT generate application code.
Do NOT generate React pages.

---

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

## Output Language

All human-readable output must be written in Russian.

This applies to:

* `ai-artifacts/00-input-index.md`;
* `ai-artifacts/04-generation-report.md`;
* all Markdown headings;
* report tables;
* descriptions;
* missing requirements;
* contradictions;
* open questions;
* questions for Product Owner.

Do not write English prose in human-readable artifacts.
Keep only file names, JSON keys, status values, technical identifiers, quoted source text, and code-like values in their original form.
Use Russian section titles in Markdown artifacts.
If an English section name is needed as a stable technical marker, write it only in parentheses after the Russian title.
Use Russian-language section titles in generated Markdown artifacts. If an English section name is needed as a stable technical marker, place it in parentheses after the Russian title.

---

## Phase 1. Requirements Inventory

Scan:

* requirements/01-base
* requirements/02-system
* requirements/03-architecture
* requirements/04-quality
* requirements/05-integrations
* requirements/06-system-scenarios
* requirements/07-scenarios
* requirements/README.md if present
* requirements/glossary.md if present

Create:

ai-artifacts/00-input-index.md

For every document record:

* title
* purpose
* key entities
* key workflows
* dependencies
* confidence level

---

## Phase 2. Product Model Extraction

Create:

ai-artifacts/01-product.model.json

Schema:

{
"productName": "",
"roles": [],
"entities": [],
"workflows": [],
"screens": [],
"states": [],
"actions": [],
"integrations": [],
"salesObjects": [],
"deliveryAndOperations": {},
"infrastructureRequirements": {},
"roleScenarios": []
}

Requirements:

### Roles

Extract all user roles.

### Entities

Extract business entities.

Example:

* Project
* Camera
* Detection Model
* Alert
* Task

### Workflows

Extract end-to-end user workflows.

Example:

* Create object
* Review result
* Configure integration

### Screens

Identify screens required to support workflows.

For each screen:

{
"id": "",
"name": "",
"purpose": "",
"inputs": [],
"outputs": [],
"actions": [],
"states": []
}

### States

Identify:

* loading
* empty
* success
* validation error
* server error

when applicable.

### Actions

List all user actions.

Example:

* Create
* Edit
* Delete
* Search
* Filter
* Export
* Approve

### Integrations

Extract all external systems.

### Product Readiness Requirements

Extract and validate mandatory product readiness requirements.

These requirements are mandatory for approving the Product Model and starting screen model generation.

Use only requirements explicitly stated in the source documents.
Do not invent, infer, or complete missing product readiness data.
Do not create sales objects, licenses, payment periodicity, price basis, delivery rules, sizing rules, localization rules, roles, or role functions unless they are explicitly described in requirements.
If a mandatory item seems likely but is not explicitly described, leave it out of the model and record it as a missing requirement and a blocking question.

The source requirements are expected to describe these topics directly, without external references:

* planned sales objects, each with `type`, `paymentPeriodicity`, and `priceBasis`;
* product delivery, installation, update method, logging, monitoring, and metrics collection;
* hardware needs, sizing, and localization;
* role lists and key role scenarios, including store opening, cash register opening, repair return, synchronization variants, and cash register clustering where relevant.

If a requirement category is explicitly marked as not needed or out of scope, preserve that confirmed business decision in the model.

If the source says only that a decision will be made later, treats it as unresolved. Record it as `NEEDS_INPUT`, formulate a concrete question, and do not proceed when it affects the current stage.

Do not infer or invent missing details.

#### Sales Objects

Extract planned sales objects.

For every sales object include:

{
"name": "",
"type": "",
"paymentPeriodicity": "",
"priceBasis": ""
}

Rules:

* `type` must be one of: license, equipment, service.
* `paymentPeriodicity` must describe how often payment is expected.
* `priceBasis` must describe whether the price is fixed or depends on a product attribute.
* Product attributes can include users, cameras, cash registers, customers, stores, devices, modules, or another explicitly described measurable attribute.

Do not invent licenses, equipment items, services, payment periods, or pricing dependencies.
They must be explicitly described in the requirements.
If a sales object is mentioned but any of these attributes are missing, record the missing attribute as a blocker.

#### Delivery And Operations

Extract requirements for:

* product delivery;
* product installation;
* product update method;
* logging;
* monitoring;
* metrics collection.

If any category is absent or too vague to guide implementation, record it as a blocker.
If a category is explicitly confirmed as not needed or out of scope, preserve that decision. If it is merely postponed without a decision, treat it as `NEEDS_INPUT`.

#### Infrastructure Requirements

Extract requirements for:

* hardware needed to run the product;
* sizing rules and expected scale;
* localization requirements.

If hardware, sizing, or localization requirements are absent, record them as blockers.
If hardware, sizing, or localization is explicitly confirmed as not needed or out of scope, preserve that decision. If it is merely postponed without a decision, treat it as `NEEDS_INPUT`.

#### Role Scenarios

Extract role-based key user scenarios.

For every role include:

{
"role": "",
"functions": []
}

The `functions` list must include role-specific actions and scenarios.

The requirements must explicitly cover these scenarios:

* opening a new store;
* opening a new cash register;
* returning a cash register or device from repair;
* synchronization setup variants, including one central cash register and master in each store;
* splitting cash registers into clusters, for example by cash registers with different camera lenses.

If the requirements mention retail launch flows, synchronization modes, or clustering rules, keep them as explicit scenarios instead of flattening them into generic operations.

If a role is known but its functions are not described, record this as a blocker.
If any required scenario is absent, record it as a blocker.

---

## Phase 3. Consistency Analysis

Create:

ai-artifacts/04-generation-report.md

Include:

# Product Discovery Report

## Readiness Status

Set exactly one status:

* READY_FOR_SCREEN_MODEL
* BLOCKED_FOR_SCREEN_MODEL

Use BLOCKED_FOR_SCREEN_MODEL if any mandatory Product Readiness Requirement is missing, incomplete, or contradictory.
When the status is BLOCKED_FOR_SCREEN_MODEL, the next stage `docs/02-screen-model-generation.md` must not be started.

## Metrics

* Roles
* Entities
* Workflows
* Screens
* States
* Actions
* Integrations
* Sales Objects
* Role Scenarios

## Missing Requirements

List gaps.
All missing mandatory Product Readiness Requirements must be listed here.
Do not list categories explicitly confirmed as not needed or out of scope as missing requirements. A decision merely postponed without an answer remains unresolved.

## Blocking Questions

List questions that must be answered before screen model generation can start.
Include a blocking question for every missing mandatory Product Readiness Requirement.
Do not create blocking questions for categories explicitly confirmed as not needed or out of scope. A category merely postponed without a confirmed decision must remain a blocking question when it affects this stage.

## Contradictions

List conflicting requirements.

## Questions For Product Owner

List unanswered questions.

---

Output files only.

Do not generate code.
Do not change business meaning in existing requirements. You may update a requirement file only after Product Manager answers a `NEEDS_INPUT` question and confirms the proposed change.
Do not start or invoke screen model generation.
