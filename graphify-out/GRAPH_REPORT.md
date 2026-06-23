# Graph Report - .  (2026-06-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 158 nodes · 376 edges · 7 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `837c5611`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]

## God Nodes (most connected - your core abstractions)
1. `Consultant` - 23 edges
2. `Project` - 19 edges
3. `Task` - 16 edges
4. `getProjectAccent()` - 9 edges
5. `isSupabaseConfigured()` - 9 edges
6. `O365Config` - 8 edges
7. `getSupabaseClient()` - 8 edges
8. `formatDateFriendly()` - 7 edges
9. `WinComboBox()` - 7 edges
10. `getSupabaseCredentials()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `GanttChart()` --calls--> `getProjectAccent()`  [EXTRACTED]
  components/GanttChart.tsx → utils/phases.ts
- `LoginProps` --references--> `Consultant`  [EXTRACTED]
  components/Login.tsx → types.ts
- `PasswordResetProps` --references--> `Consultant`  [EXTRACTED]
  components/PasswordReset.tsx → types.ts
- `ProjectDetailsProps` --references--> `O365Config`  [EXTRACTED]
  components/ProjectDetails.tsx → types.ts
- `ProjectKanbanColumn` --references--> `Project`  [EXTRACTED]
  components/ProjectsList.tsx → types.ts

## Import Cycles
- None detected.

## Communities (7 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (22): formatDateFriendly(), PROJECT_ICONS, ProjectDetails(), buildForm(), clampProgress(), DrawerForm, KanbanGroupMode, OWNER_OPTIONS (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (14): EditProjectModalProps, GanttChartProps, NewProjectModalProps, PasswordResetProps, ProjectDetailsProps, ProjectKanbanColumn, ProjectsListProps, KanbanColumn (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (20): ADMIN_FALLBACK, LoginProps, Logo(), LogoProps, Settings(), SettingsProps, O365Config, hashPassword() (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (14): defaultConsultants, defaultO365Config, defaultProjects, Toast, CroppedLogo(), CroppedLogoProps, PROJECT_STATUS_OPTIONS, ProjectKanbanGroupMode (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (17): clamp(), GanttChart(), GanttPopover(), initials(), isToday(), PopoverProps, STATUS_COLOR, STATUS_LABEL (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (10): DashboardProps, formatDateTimeFriendly(), STATUS_META, PHASE_ORDER, PhaseMeta, PHASES, ProjectLike, resolvePhase() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.46
Nodes (7): createOutlookCalendarEvent(), getAccessToken(), getMsalInstance(), getOrCreateTodoList(), signInMicrosoft(), signOutMicrosoft(), syncTaskToO365()

## Knowledge Gaps
- **32 isolated node(s):** `Toast`, `defaultConsultants`, `defaultProjects`, `defaultO365Config`, `CroppedLogoProps` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Consultant` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Project` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `Task` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `Toast`, `defaultConsultants`, `defaultProjects` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09206349206349207 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12433862433862433 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14814814814814814 - nodes in this community are weakly interconnected._