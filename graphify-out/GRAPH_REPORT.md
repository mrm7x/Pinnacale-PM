# Graph Report - Pinnacale-PM  (2026-07-16)

## Corpus Check
- 68 files · ~81,942 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 395 nodes · 665 edges · 58 communities (20 shown, 38 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf9a277d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_App Shell & Shared UI|App Shell & Shared UI]]
- [[_COMMUNITY_Task List Table & Editing|Task List Table & Editing]]
- [[_COMMUNITY_Project Modals & Details|Project Modals & Details]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Dashboard & Stats|Dashboard & Stats]]
- [[_COMMUNITY_Excel Export|Excel Export]]
- [[_COMMUNITY_Roles & Permissions|Roles & Permissions]]
- [[_COMMUNITY_App TS Config|App TS Config]]
- [[_COMMUNITY_Node TS Config|Node TS Config]]
- [[_COMMUNITY_Graphify Skill Reference Docs|Graphify Skill Reference Docs]]
- [[_COMMUNITY_Security Hardening & Deploys|Security Hardening & Deploys]]
- [[_COMMUNITY_Edge Function CORS Handling|Edge Function CORS Handling]]
- [[_COMMUNITY_Edge Function CORS Handling|Edge Function CORS Handling]]
- [[_COMMUNITY_Root TS Config|Root TS Config]]
- [[_COMMUNITY_App Shell (index.html)|App Shell (index.html)]]
- [[_COMMUNITY_Favicon Icon|Favicon Icon]]
- [[_COMMUNITY_Social Icon Sprite|Social Icon Sprite]]
- [[_COMMUNITY_Cropped Logo Icon|Cropped Logo Icon]]
- [[_COMMUNITY_Hero Graphic|Hero Graphic]]
- [[_COMMUNITY_Primary App Logo|Primary App Logo]]
- [[_COMMUNITY_Pinnacle Flow Logo (Dark Variant)|Pinnacle Flow Logo (Dark Variant)]]
- [[_COMMUNITY_Pinnacle Flow Logo (Light Variant)|Pinnacle Flow Logo (Light Variant)]]
- [[_COMMUNITY_React Logo Icon|React Logo Icon]]
- [[_COMMUNITY_Vite Logo Icon|Vite Logo Icon]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_graphify reference extra exports and benchmark|graphify reference: extra exports and benchmark]]
- [[_COMMUNITY_Pinnacle Projects — Security Remediation Runbook|Pinnacle Projects — Security Remediation Runbook]]
- [[_COMMUNITY_graphify reference query, path, explain|graphify reference: query, path, explain]]
- [[_COMMUNITY_graphify reference add a URL and watch a folder|graphify reference: add a URL and watch a folder]]
- [[_COMMUNITY_graphify reference commit hook and native CLAUDE.md integration|graphify reference: commit hook and native CLAUDE.md integration]]
- [[_COMMUNITY_graphify reference incremental update and cluster-only|graphify reference: incremental update and cluster-only]]
- [[_COMMUNITY_React + TypeScript + Vite|React + TypeScript + Vite]]
- [[_COMMUNITY_graphify reference GitHub clone and cross-repo merge|graphify reference: GitHub clone and cross-repo merge]]
- [[_COMMUNITY_graphify reference transcribe video and audio|graphify reference: transcribe video and audio]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_extraction-spec|extraction-spec.md]]
- [[_COMMUNITY_Graphify Extra Exports and Benchmark|Graphify Extra Exports and Benchmark]]
- [[_COMMUNITY_Extraction Subagent Prompt Spec|Extraction Subagent Prompt Spec]]
- [[_COMMUNITY_GitHub Clone and Cross-Repo Merge|GitHub Clone and Cross-Repo Merge]]
- [[_COMMUNITY_Git Commit Hook and CLAUDE.md Integration|Git Commit Hook and CLAUDE.md Integration]]
- [[_COMMUNITY_Query, Path, Explain Flows|Query, Path, Explain Flows]]
- [[_COMMUNITY_VideoAudio Transcription Flow|Video/Audio Transcription Flow]]
- [[_COMMUNITY_Incremental Update and Cluster-Only|Incremental Update and Cluster-Only]]
- [[_COMMUNITY_graphify Skill Pipeline|/graphify Skill Pipeline]]
- [[_COMMUNITY_Graphify Slash-Command Trigger Rule|Graphify Slash-Command Trigger Rule]]
- [[_COMMUNITY_Graphify Project Rules|Graphify Project Rules]]
- [[_COMMUNITY_React + TypeScript + Vite Template|React + TypeScript + Vite Template]]
- [[_COMMUNITY_Admin Backdoor Removal (Login.tsx)|Admin Backdoor Removal (Login.tsx)]]
- [[_COMMUNITY_Hardcoded Hash Removal (App.tsx)|Hardcoded Hash Removal (App.tsx)]]
- [[_COMMUNITY_Manual Dashboard Actions M1-M6|Manual Dashboard Actions M1-M6]]
- [[_COMMUNITY_Password Hash Wipe Migration|Password Hash Wipe Migration]]
- [[_COMMUNITY_Phase 2 Real Authentication + Role-Based Authorization|Phase 2: Real Authentication + Role-Based Authorization]]
- [[_COMMUNITY_Phase 3 Hardening|Phase 3: Hardening]]
- [[_COMMUNITY_RLS Lockdown Migration|RLS Lockdown Migration]]
- [[_COMMUNITY_Pinnacle Projects Security Remediation Runbook|Pinnacle Projects Security Remediation Runbook]]

## God Nodes (most connected - your core abstractions)
1. `Consultant` - 24 edges
2. `Project` - 21 edges
3. `Task` - 18 edges
4. `compilerOptions` - 17 edges
5. `compilerOptions` - 16 edges
6. `isAdmin()` - 14 edges
7. `isManager()` - 12 edges
8. `What You Must Do When Invoked` - 12 edges
9. `ActiveUser` - 11 edges
10. `Customer` - 11 edges

## Surprising Connections (you probably didn't know these)
- `LoginProps` --references--> `Consultant`  [EXTRACTED]
  src/components/Login.tsx → src/types.ts
- `KanbanColumn` --references--> `Task`  [EXTRACTED]
  src/components/TaskListV2.tsx → src/types.ts
- `FlatTask` --references--> `Task`  [EXTRACTED]
  src/utils/exportToExcel.ts → src/types.ts
- `GanttChart()` --calls--> `getProjectAccent()`  [EXTRACTED]
  src/components/GanttChart.tsx → src/utils/phases.ts
- `PasswordResetProps` --references--> `Consultant`  [EXTRACTED]
  src/components/PasswordReset.tsx → src/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Skill Reference Set** — _claude_skills_graphify_skill_command, _claude_skills_graphify_references_query_query_path_explain, _claude_skills_graphify_references_update_incremental_update, _claude_skills_graphify_references_exports_exports, _claude_skills_graphify_references_add_watch_add_and_watch, _claude_skills_graphify_references_hooks_commit_hook, _claude_skills_graphify_references_transcribe_transcription_flow, _claude_skills_graphify_references_github_and_merge_clone_and_merge, _claude_skills_graphify_references_extraction_spec_subagent_prompt [EXTRACTED 1.00]
- **Phase 1: Stop the Bleeding** — security_runbook_rls_lockdown_migration, security_runbook_password_hash_wipe_migration, security_runbook_admin_backdoor_removal, security_runbook_hardcoded_hash_removal [EXTRACTED 1.00]
- **Deploy Then Verify Security Posture** — _github_workflows_deploy_deploy_migrations_workflow, security_runbook_manual_actions_m1_m6, security_runbook_rls_lockdown_migration [INFERRED 0.85]

## Communities (58 total, 38 thin omitted)

### Community 0 - "App Shell & Shared UI"
Cohesion: 0.08
Nodes (24): defaultConsultants, defaultProjects, Toast, CroppedLogo(), CroppedLogoProps, LoginProps, Logo(), LogoProps (+16 more)

### Community 1 - "Task List Table & Editing"
Cohesion: 0.07
Nodes (24): buildForm(), clampProgress(), COLUMN_DEFS, ColumnDef, DEFAULT_COLUMNS, DrawerForm, KanbanColumn, loadViews() (+16 more)

### Community 2 - "Project Modals & Details"
Cohesion: 0.14
Nodes (23): EditProjectModalProps, GanttChartProps, NewProjectModalProps, PasswordResetProps, ProjectDetailsProps, PROJECT_STATUS_OPTIONS, ProjectKanbanColumn, ProjectKanbanGroupMode (+15 more)

### Community 3 - "Package Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, exceljs, lucide-react, react, react-dom, @supabase/supabase-js, devDependencies, eslint (+22 more)

### Community 4 - "Dashboard & Stats"
Cohesion: 0.10
Nodes (25): DashboardProps, formatDateFriendly(), formatDateTimeFriendly(), STATUS_META, clamp(), GanttChart(), GanttPopover(), initials() (+17 more)

### Community 5 - "Excel Export"
Cohesion: 0.12
Nodes (26): TaskModal(), addGanttSheet(), addTaskSheet(), applyDataCell(), applyHeaderCell(), BorderStyle, buildFlatList(), exportProjectToExcel() (+18 more)

### Community 6 - "Roles & Permissions"
Cohesion: 0.22
Nodes (24): App(), TaskListV2(), activeUserFromConsultant(), activeUserFromCustomer(), canCreateProject(), canCreateTask(), canDeleteProject(), canDeleteTask() (+16 more)

### Community 7 - "App TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 8 - "Node TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 10 - "Security Hardening & Deploys"
Cohesion: 0.67
Nodes (3): Deploy delete-user Edge Function, Deploy Migrations GitHub Actions Workflow, Deploy invite-user Edge Function

### Community 26 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 27 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 28 - "Pinnacle Projects — Security Remediation Runbook"
Cohesion: 0.25
Nodes (7): ✅ Automated (in this changeset), ⚠️ Manual actions (MUST be done by an admin — cannot be done from code), Phase 1 — Stop the bleeding (URGENT), Phase 2 — Real authentication + role-based authorization (next), Phase 3 — Hardening, Pinnacle Projects — Security Remediation Runbook, Verification after deploying Phase 1

### Community 29 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 30 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 31 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 32 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 33 - "React + TypeScript + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + TypeScript + Vite

## Knowledge Gaps
- **175 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Consultant` connect `Project Modals & Details` to `App Shell & Shared UI`, `Task List Table & Editing`, `Dashboard & Stats`, `Excel Export`, `Roles & Permissions`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `Project` connect `Project Modals & Details` to `App Shell & Shared UI`, `Task List Table & Editing`, `Dashboard & Stats`, `Excel Export`, `Roles & Permissions`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `Task` connect `Project Modals & Details` to `App Shell & Shared UI`, `Task List Table & Editing`, `Dashboard & Stats`, `Excel Export`, `Roles & Permissions`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _180 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Shared UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07922705314009662 - nodes in this community are weakly interconnected._
- **Should `Task List Table & Editing` be split into smaller, more focused modules?**
  _Cohesion score 0.07394957983193277 - nodes in this community are weakly interconnected._
- **Should `Project Modals & Details` be split into smaller, more focused modules?**
  _Cohesion score 0.13763440860215054 - nodes in this community are weakly interconnected._