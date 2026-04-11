<!-- Source: docs/epics/agentic-module-generation-stories.md -->

## Story 6: Scoring and Repair Machinery Removal

### Summary
<!-- Jira: Summary field -->

Pre-generation scoring and post-generation repair/coercion removed from the module generation path.

### Description
<!-- Jira: Description field -->

**User Profile:**
- **Primary User:** Developer running `liminal-docgen generate` against their codebase
- **Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
- **Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
- **Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

**Objective:** Remove the deterministic packet-selection scoring algorithm and the post-generation repair/coercion machinery from the module generation path. The agent decides what sections to include based on examining actual code. Validation enforces output correctness after the fact. Page rendering (assembling markdown from structured sections) and deterministic context assembly are retained.

**Scope:**

*In:*
- Remove pre-generation scoring (packet-mode prediction, conservative-mode thresholds)
- Remove post-generation repair prompts and output coercion
- Verify page rendering still produces valid markdown from agent-produced sections
- Verify validation still catches errors regardless of how output was produced

*Out:*
- Changes to validation checks themselves
- Changes to page rendering logic (rendering is retained)
- Changes to context assembly (context assembly is retained)

**Dependencies:** Story 4 (agentic generation replaces scoring), Story 5 (degradation handles failures that repair previously caught)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-6.1:** Module generation path does not contain pre-generation scoring or post-generation repair

- **TC-6.1a: No pre-generation section prediction**
  - Given: A module is about to be generated
  - When: The generation stage begins for that module
  - Then: No scoring, packet-mode prediction, or conservative-mode threshold evaluation occurs before the agent starts
- **TC-6.1b: No inline repair on agent output**
  - Given: An agent produces output that doesn't match a specific section template
  - When: The output is collected
  - Then: No repair prompt or coercion is attempted; validation catches errors after assembly

**AC-6.2:** Module page rendering still produces valid markdown from structured sections

- **TC-6.2a: Rendering from agent-produced sections matches expected format**
  - Given: An agent produces structured sections (overview, structure diagram, entity table)
  - When: Sections are passed to the renderer
  - Then: Output markdown has correct section order, Mermaid fencing, and table formatting
- **TC-6.2b: Rendering handles partial sections (no diagram, no sequence)**
  - Given: An agent produces only overview and responsibilities
  - When: Sections are passed to the renderer
  - Then: Output markdown contains those sections without empty diagram placeholders

**AC-6.3:** Validation catches bad output regardless of how it was produced

- **TC-6.3a: Invalid Mermaid still caught by validation**
  - Given: Agent produces a page with malformed Mermaid
  - When: Validation runs
  - Then: Mermaid check reports the error
- **TC-6.3b: Missing overview still caught by validation**
  - Given: Agent produces a page without an overview section
  - When: Page is assembled and validated
  - Then: Validation reports missing required content

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

No new data contracts. This story removes code rather than adding it. The relevant contracts are:

- Page sections produced by the agent (`PageSectionKind` — defined in Story 0)
- Page validation checks (existing, unchanged)
- Page rendering logic (existing, unchanged)

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] No pre-generation scoring, packet-mode prediction, or conservative-mode thresholds in module generation path
- [ ] No post-generation repair prompts or output coercion in module generation path
- [ ] Page rendering produces valid markdown from agent-produced sections
- [ ] Rendering handles partial sections without empty placeholders
- [ ] Validation catches malformed Mermaid, missing overview, and other errors
- [ ] All tests pass
- [ ] Removed code identified and confirmed unused before deletion
