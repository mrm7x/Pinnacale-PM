import { useMemo, useRef, useState } from 'react';
import {
  FolderKanban, LayoutDashboard, Settings as SettingsIcon,
  Sun, Moon, LogOut, PanelLeft, ChevronDown, Search, Check
} from 'lucide-react';
import type { Project } from '../types';
import type { ActiveUser } from '../utils/permissions';
import { isCustomer } from '../utils/permissions';
import { visibleProjectTabs, ragDotColor, type ProjectTab } from '../utils/navigation';
import Logo from './Logo';
import CroppedLogo from './CroppedLogo';

export type AppTab = 'dashboard' | 'projects' | 'settings';

export interface NavProps {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  /** Projects the user may see (no templates). */
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  projectTab: ProjectTab;
  onProjectTabChange: (tab: ProjectTab) => void;
  recentProjectIds: string[];
  activeUser: ActiveUser | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
}

const initials = (u: ActiveUser | null) => {
  if (u?.tier === 'superuser') return 'SU';
  if (u?.tier === 'admin') return 'AD';
  return u?.name.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U';
};

const avatarBg = (u: ActiveUser | null) =>
  u?.tier === 'superuser' || u?.tier === 'admin' ? '#11354A' : (u?.avatarColor || '#11354A');

const useRecentProjects = (projects: Project[], recentIds: string[], excludeId?: string | null, max = 6) =>
  useMemo(() => {
    const byId = new Map(projects.map(p => [p.id, p]));
    return recentIds
      .filter(id => id !== excludeId)
      .map(id => byId.get(id))
      .filter((p): p is Project => !!p)
      .slice(0, max);
  }, [projects, recentIds, excludeId, max]);

const RagDot = ({ project }: { project: Project }) => (
  <span className="nav-rag-dot" style={{ backgroundColor: ragDotColor(project.ragOverall) }} aria-hidden="true" />
);

/* ======================================================================
   Project-aware sidebar
   ====================================================================== */

interface SideNavProps extends NavProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
}

export function SideNav(props: SideNavProps) {
  const {
    activeTab, onNavigate, projects, selectedProjectId, onSelectProject,
    projectTab, onProjectTabChange, recentProjectIds, activeUser,
    theme, onToggleTheme, onLogout, collapsed, onToggleCollapsed, mobileOpen
  } = props;
  const customer = isCustomer(activeUser);
  const inProject = activeTab === 'projects' && !!selectedProjectId;
  const currentProject = inProject ? projects.find(p => p.id === selectedProjectId) : undefined;
  const recent = useRecentProjects(projects, recentProjectIds, currentProject?.id);

  const navItem = (opts: { key: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void; sub?: boolean }) => (
    <li
      key={opts.key}
      className={`nav-item ${opts.sub ? 'nav-item-sub' : ''} ${opts.active ? 'active' : ''}`}
      onClick={opts.onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick(); } }}
      title={opts.label}
      role="button"
      tabIndex={0}
      aria-current={opts.active ? 'page' : undefined}
    >
      {opts.icon}
      <span>{opts.label}</span>
    </li>
  );

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="brand-section">
          {!collapsed ? <Logo style={{ height: '24px', width: 'auto' }} /> : <CroppedLogo style={{ height: '24px', width: 'auto' }} />}
        </div>

        <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} aria-label="Main">
          <ul className="nav-list">
            {!customer && navItem({
              key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />,
              active: activeTab === 'dashboard', onClick: () => onNavigate('dashboard')
            })}
            {navItem({
              key: 'projects', label: 'Projects', icon: <FolderKanban size={18} />,
              active: activeTab === 'projects' && !selectedProjectId,
              onClick: () => { onSelectProject(null); onNavigate('projects'); }
            })}
          </ul>

          {currentProject && (
            <>
              <div className="nav-project-head" title={currentProject.name}>
                <RagDot project={currentProject} />
                <span className="nav-project-name">{currentProject.name}</span>
              </div>
              <ul className="nav-list nav-project-tabs">
                {visibleProjectTabs(customer).map(t => {
                  const Icon = t.icon;
                  return navItem({
                    key: t.id, label: t.label, icon: <Icon size={17} />, sub: true,
                    active: projectTab === t.id,
                    onClick: () => onProjectTabChange(t.id)
                  });
                })}
              </ul>
            </>
          )}

          {!collapsed && recent.length > 0 && (
            <>
              <div className="nav-section-label">Recently opened</div>
              <ul className="nav-recent">
                {recent.map(p => (
                  <li
                    key={p.id}
                    className="nav-subitem"
                    onClick={() => { onSelectProject(p.id); onNavigate('projects'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProject(p.id); onNavigate('projects'); } }}
                    role="button"
                    tabIndex={0}
                    title={p.name}
                  >
                    <RagDot project={p} />
                    <span className="nav-subitem-text">{p.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>
      </div>

      <div className="side-foot">
        <div className="acct" title={collapsed ? `${activeUser?.name || 'User'} · ${activeUser?.role || 'User'}` : undefined}>
          <span className="acct-avatar" style={{ backgroundColor: avatarBg(activeUser) }}>{initials(activeUser)}</span>
          <span className="acct-who">
            <span className="acct-name">{activeUser?.name || 'User'}</span>
            <span className="acct-role">{activeUser?.role || 'User'}</span>
          </span>
          <button className="side-icon" onClick={onLogout} title="Sign out" aria-label="Sign out">
            <LogOut size={15} />
          </button>
        </div>

        <div className="side-row">
          {!customer && (
            <div
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => onNavigate('settings')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('settings'); }}
              title="Settings"
              role="button"
              tabIndex={0}
            >
              <SettingsIcon size={17} />
              <span>Settings</span>
            </div>
          )}
          <button
            className="side-icon"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            className="side-icon desktop-only-toggle"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeft size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ======================================================================
   Top bar
   ====================================================================== */

function ProjectSwitcher({ projects, selectedProjectId, recentProjectIds, onPick }: {
  projects: Project[];
  selectedProjectId: string | null;
  recentProjectIds: string[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const current = projects.find(p => p.id === selectedProjectId);
  const recent = useRecentProjects(projects, recentProjectIds, null, 5);


  const q = query.trim().toLowerCase();
  const matches = q
    ? projects.filter(p => p.name.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q))
    : [...projects].sort((a, b) => a.name.localeCompare(b.name));

  const pick = (id: string) => { setOpen(false); onPick(id); };

  const row = (p: Project) => (
    <button
      key={p.id}
      role="menuitem"
      className={p.id === selectedProjectId ? 'current' : ''}
      onClick={() => pick(p.id)}
      title={`${p.name} (${p.clientName})`}
    >
      <RagDot project={p} />
      <span className="switcher-name">{p.name}</span>
      <span className="switcher-client">{p.clientName}</span>
      {p.id === selectedProjectId && <Check size={14} className="switcher-check" />}
    </button>
  );

  return (
    <div className="menu-anchor topnav-switcher">
      <button
        className="topnav-switcher-btn"
        onClick={() => {
          if (!open) { setQuery(''); requestAnimationFrame(() => inputRef.current?.focus()); }
          setOpen(!open);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? current.name : 'Jump to a project'}
      >
        {current ? <RagDot project={current} /> : <Search size={14} />}
        <span className="topnav-switcher-label">{current ? current.name : 'Jump to project'}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="menu-dismiss" onClick={() => setOpen(false)} />
          <div
            className="menu switcher-menu"
            role="menu"
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          >
            <div className="switcher-search">
              <Search size={14} />
              <input
                ref={inputRef}
                className="form-input"
                placeholder="Search projects or clients"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) pick(matches[0].id); }}
              />
            </div>
            <div className="switcher-list">
              {!q && recent.length > 0 && (
                <>
                  <div className="switcher-label">Recently opened</div>
                  {recent.map(row)}
                  <div className="menu-sep" />
                  <div className="switcher-label">All projects</div>
                </>
              )}
              {matches.length > 0 ? matches.map(row) : <div className="switcher-empty">No projects match “{query}”.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TopNav(props: NavProps) {
  const {
    activeTab, onNavigate, projects, selectedProjectId, onSelectProject,
    recentProjectIds, activeUser, theme, onToggleTheme, onLogout
  } = props;
  const customer = isCustomer(activeUser);
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs: { id: AppTab; label: string; icon: React.ReactNode; hidden?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, hidden: customer },
    { id: 'projects', label: 'Projects', icon: <FolderKanban size={16} /> },
  ];

  return (
    <header className="topnav">
      <button className="topnav-brand" onClick={() => { onSelectProject(null); onNavigate('projects'); }} title="All projects" aria-label="All projects">
        <Logo className="topnav-logo-full" style={{ height: '22px', width: 'auto' }} />
        <CroppedLogo className="topnav-logo-mark" style={{ height: '22px', width: 'auto' }} />
      </button>

      <nav className="topnav-tabs" aria-label="Main">
        {tabs.filter(t => !t.hidden).map(t => (
          <button
            key={t.id}
            className={activeTab === t.id ? 'active' : ''}
            aria-current={activeTab === t.id ? 'page' : undefined}
            onClick={() => { if (t.id === 'projects') onSelectProject(null); onNavigate(t.id); }}
            title={t.label}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>

      <ProjectSwitcher
        projects={projects}
        selectedProjectId={activeTab === 'projects' ? selectedProjectId : null}
        recentProjectIds={recentProjectIds}
        onPick={(id) => { onSelectProject(id); onNavigate('projects'); }}
      />

      <div className="menu-anchor topnav-account">
        <button
          className="topnav-avatar"
          onClick={() => setMenuOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={`${activeUser?.name || 'User'} · ${activeUser?.role || 'User'}`}
          style={{ backgroundColor: avatarBg(activeUser) }}
        >
          {initials(activeUser)}
        </button>
        {menuOpen && (
          <>
            <div className="menu-dismiss" onClick={() => setMenuOpen(false)} />
            <div className="menu" role="menu" onClick={() => setMenuOpen(false)}>
              <div className="topnav-who">
                <span className="acct-name">{activeUser?.name || 'User'}</span>
                <span className="acct-role">{activeUser?.role || 'User'}</span>
              </div>
              <div className="menu-sep" />
              {!customer && (
                <button role="menuitem" onClick={() => onNavigate('settings')}>
                  <SettingsIcon size={15} /> Settings
                </button>
              )}
              <button role="menuitem" onClick={onToggleTheme}>
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <div className="menu-sep" />
              <button role="menuitem" className="danger" onClick={onLogout}>
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
