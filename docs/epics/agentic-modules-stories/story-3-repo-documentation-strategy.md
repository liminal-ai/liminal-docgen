<!-- Source: docs/epics/agentic-module-generation-stories.md -->

## Story 3: Repo Documentation Strategy

### Summary
<!-- Jira: Summary field -->

System examines the classified repository and produces a documentation strategy before module planning.

### Description
<!-- Jira: Description field -->

**User Profile:**
- **Primary User:** Developer running `liminal-docgen generate` against their codebase
- **Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
- **Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
- **Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

**Objective:** After component-level classification and before module planning, the system assembles a strategy input from the classified analysis and sends it to the inference provider (one-shot, not agentic). The provider returns a documentation strategy: repo classification, boundary recommendations, zone treatments. The strategy is persisted for use during generation and future update runs. The clustering prompt receives strategy context.

**Scope:**

*In:*
- Strategy input assembly from classified analysis (deterministic)
- One-shot inference call for strategy selection
- Strategy persistence alongside run metadata
- Strategy loading in update mode
- Strategy context injected into the clustering/planning prompt

*Out:*
- Agentic strategy selection (this is one-shot)
- Module archetype assignment (runs after planning, covered in Story 1's classification logic)
- Changes to module planning algorithm itself

**Dependencies:** Story 1 (component-level classification must exist to feed strategy input)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-2.1:** System produces a documentation strategy before module planning begins

- **TC-2.1a: Strategy produced for standard TS repo**
  - Given: A TypeScript repository with 20+ components
  - When: Generation pipeline reaches the strategy stage
  - Then: A `DocumentationStrategy` is produced containing repo classification, boundary recommendations, and zone treatments
- **TC-2.1b: Strategy produced for mixed-language repo**
  - Given: A repository with TypeScript and Python files
  - When: Generation pipeline reaches the strategy stage
  - Then: Strategy reflects both language zones and their recommended treatment
- **TC-2.1c: Strategy produced for small repo**
  - Given: A repository with fewer than 8 components
  - When: Generation pipeline reaches the strategy stage
  - Then: Strategy still produced (may recommend summary-only for all modules)

**AC-2.2:** Documentation strategy is persisted alongside run metadata

- **TC-2.2a: Strategy file written to output directory**
  - Given: Strategy selection completes successfully
  - When: Generation proceeds to planning
  - Then: Strategy is available in output metadata and accessible to downstream stages
- **TC-2.2b: Strategy available during update mode**
  - Given: A prior generation run produced a persisted strategy
  - When: An update run reads prior state
  - Then: Prior strategy is loaded and available for comparison
- **TC-2.2c: Fresh strategy replaces stale strategy in update mode**
  - Given: A prior strategy exists but the repo structure has changed significantly (new zones, different role distribution)
  - When: Update run produces a fresh strategy
  - Then: Fresh strategy is used for this run and persisted, replacing the prior strategy

**AC-2.3:** Strategy input is assembled deterministically from classified analysis output

- **TC-2.3a: Same classified analysis produces same strategy input**
  - Given: Two identical classified analysis outputs
  - When: Strategy input is assembled from each
  - Then: Both strategy inputs are byte-identical
- **TC-2.3b: Strategy input includes classification dimensions**
  - Given: Any valid classified `RepositoryAnalysis`
  - When: Strategy input is assembled
  - Then: Input contains component count, language distribution, directory tree summary, relationship density, zone distribution, and role distribution

**AC-2.4:** Module planning receives strategy context

- **TC-2.4a: Clustering prompt includes strategy guidance**
  - Given: A documentation strategy has been produced
  - When: The clustering prompt is built
  - Then: Prompt includes the strategy's boundary recommendations and zone treatments

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

```typescript
type RepoClassification =
  | "service-app" | "library" | "cli-tool"
  | "monolith" | "monorepo" | "mixed";

interface DocumentationStrategy {
  repoClassification: RepoClassification;
  boundaries: DocumentationBoundary[];
  zoneGuidance: ZoneGuidance[];
}

interface DocumentationBoundary {
  name: string;
  componentPatterns: string[];
  recommendedPageShape: PageShape;
}

type PageShape = "full-structured" | "summary-only" | "overview-only";

interface ZoneGuidance {
  zone: CodeZone;
  treatment: "document" | "summarize" | "exclude";
  reason: string;
}
```

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Strategy produced for all repo shapes (standard, mixed-language, small)
- [ ] Strategy input assembly is deterministic
- [ ] Strategy persisted in output metadata
- [ ] Prior strategy loaded in update mode; fresh strategy replaces stale
- [ ] Clustering prompt includes strategy boundary and zone guidance
- [ ] `.module-plan.json` format backward compatible with prior runs
- [ ] Strategy selection completes within one inference call
- [ ] All tests pass
