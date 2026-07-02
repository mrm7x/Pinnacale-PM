# Graph Report - .  (2026-07-02)

## Corpus Check
- 77 files · ~78,209 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 314 nodes · 585 edges · 26 communities (13 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.82)
- Token cost: 0 input · 311,484 output

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

## God Nodes (most connected - your core abstractions)
1. `Consultant` - 24 edges
2. `Project` - 21 edges
3. `Task` - 18 edges
4. `compilerOptions` - 17 edges
5. `compilerOptions` - 16 edges
6. `isManager()` - 12 edges
7. `Customer` - 11 edges
8. `getProjectAccent()` - 11 edges
9. `getSupabaseClient()` - 10 edges
10. `/graphify Skill Pipeline` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Graphify Project Rules` --semantically_similar_to--> `Graphify Slash-Command Trigger Rule`  [INFERRED] [semantically similar]
  CLAUDE.md → .claude/CLAUDE.md
- `Graphify Project Rules` --conceptually_related_to--> `/graphify Skill Pipeline`  [INFERRED]
  CLAUDE.md → .claude/skills/graphify/SKILL.md
- `React + TypeScript + Vite Template` --shares_data_with--> `Pinnacle Flow App Shell (index.html)`  [INFERRED]
  README.md → index.html
- `LoginProps` --references--> `Consultant`  [EXTRACTED]
  src/components/Login.tsx → src/types.ts
- `PasswordResetProps` --references--> `Consultant`  [EXTRACTED]
  src/components/PasswordReset.tsx → src/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Skill Reference Set** — _claude_skills_graphify_skill_command, _claude_skills_graphify_references_query_query_path_explain, _claude_skills_graphify_references_update_incremental_update, _claude_skills_graphify_references_exports_exports, _claude_skills_graphify_references_add_watch_add_and_watch, _claude_skills_graphify_references_hooks_commit_hook, _claude_skills_graphify_references_transcribe_transcription_flow, _claude_skills_graphify_references_github_and_merge_clone_and_merge, _claude_skills_graphify_references_extraction_spec_subagent_prompt [EXTRACTED 1.00]
- **Phase 1: Stop the Bleeding** — security_runbook_rls_lockdown_migration, security_runbook_password_hash_wipe_migration, security_runbook_admin_backdoor_removal, security_runbook_hardcoded_hash_removal [EXTRACTED 1.00]
- **Deploy Then Verify Security Posture** — _github_workflows_deploy_deploy_migrations_workflow, security_runbook_manual_actions_m1_m6, security_runbook_rls_lockdown_migration [INFERRED 0.85]

## Communities (26 total, 13 thin omitted)

### Community 0 - "App Shell & Shared UI"
Cohesion: 0.07
Nodes (29): App(), defaultConsultants, defaultProjects, Toast, CroppedLogo(), CroppedLogoProps, LoginProps, Logo() (+21 more)

### Community 1 - "Task List Table & Editing"
Cohesion: 0.08
Nodes (23): buildForm(), clampProgress(), COLUMN_DEFS, ColumnDef, DEFAULT_COLUMNS, DrawerForm, KanbanColumn, loadViews() (+15 more)

### Community 2 - "Project Modals & Details"
Cohesion: 0.14
Nodes (24): EditProjectModalProps, GanttChartProps, NewProjectModalProps, PROJECT_ICONS, ProjectDetailsProps, PROJECT_STATUS_OPTIONS, ProjectKanbanColumn, ProjectKanbanGroupMode (+16 more)

### Community 3 - "Package Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, exceljs, lucide-react, react, react-dom, @supabase/supabase-js, devDependencies, eslint (+22 more)

### Community 4 - "Dashboard & Stats"
Cohesion: 0.10
Nodes (21): DashboardProps, formatDateFriendly(), formatDateTimeFriendly(), STATUS_META, clamp(), GanttChart(), GanttPopover(), initials() (+13 more)

### Community 5 - "Excel Export"
Cohesion: 0.12
Nodes (26): TaskModal(), addGanttSheet(), addTaskSheet(), applyDataCell(), applyHeaderCell(), BorderStyle, buildFlatList(), exportProjectToExcel() (+18 more)

### Community 6 - "Roles & Permissions"
Cohesion: 0.21
Nodes (22): ProjectDetails(), TaskListV2(), canCreateProject(), canCreateTask(), canDeleteProject(), canDeleteTask(), canDuplicateProject(), canEditAnyTask() (+14 more)

### Community 7 - "App TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 8 - "Node TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 9 - "Graphify Skill Reference Docs"
Cohesion: 0.20
Nodes (11): /graphify add and --watch, Graphify Extra Exports and Benchmark, Extraction Subagent Prompt Spec, GitHub Clone and Cross-Repo Merge, Git Commit Hook and CLAUDE.md Integration, Query, Path, Explain Flows, Video/Audio Transcription Flow, Incremental Update and Cluster-Only (+3 more)

### Community 10 - "Security Hardening & Deploys"
Cohesion: 0.20
Nodes (11): Deploy delete-user Edge Function, Deploy Migrations GitHub Actions Workflow, Deploy invite-user Edge Function, Admin Backdoor Removal (Login.tsx), Hardcoded Hash Removal (App.tsx), Manual Dashboard Actions M1-M6, Password Hash Wipe Migration, Phase 2: Real Authentication + Role-Based Authorization (+3 more)

## Knowledge Gaps
- **120 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Consultant` connect `Project Modals & Details` to `App Shell & Shared UI`, `Task List Table & Editing`, `Dashboard & Stats`, `Excel Export`, `Roles & Permissions`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Project` connect `Project Modals & Details` to `App Shell & Shared UI`, `Task List Table & Editing`, `Dashboard & Stats`, `Excel Export`, `Roles & Permissions`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `Task` connect `Project Modals & Details` to `App Shell & Shared UI`, `Task List Table & Editing`, `Dashboard & Stats`, `Excel Export`, `Roles & Permissions`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _123 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Shared UI` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._
- **Should `Task List Table & Editing` be split into smaller, more focused modules?**
  _Cohesion score 0.0766488413547237 - nodes in this community are weakly interconnected._
- **Should `Project Modals & Details` be split into smaller, more focused modules?**
  _Cohesion score 0.13636363636363635 - nodes in this community are weakly interconnected._