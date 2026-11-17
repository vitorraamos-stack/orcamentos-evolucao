import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessOperationalSection } from "@/lib/authz";
import { getRoleLabel } from "@/lib/hubRoles";
import { getCurrentUserDisplayName } from "@/shared/users/userDisplay";
import { useAvatarPhoto } from "@/shared/users/avatarPhoto";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import "./queue-reference-shell.css";

type NavItem = { initials: string; label: string; href: string };

function formatHeaderDate() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return parts.charAt(0).toUpperCase() + parts.slice(1);
}

/** Shell scoped to the individual queue. Other system pages preserve their native navigation. */
export default function QueueReferenceShell({ children }: { children: ReactNode }) {
  const { user, role, signOut, hubPermissions, hasModuleAccess } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const avatarUrl = useAvatarPhoto(user?.id);
  const name = getCurrentUserDisplayName(user);
  const initial = name.charAt(0).toUpperCase();
  const access = { hasModuleAccess, permissions: hubPermissions };
  const canOrders = canAccessOperationalSection(access, "orders");
  const canArt = canAccessOperationalSection(access, "art");
  const canProduction = canAccessOperationalSection(access, "production");
  const canInstallations = canAccessOperationalSection(access, "installations");

  const navItems: NavItem[] = [
    ...(canOrders ? [
      { initials: "MP", label: "Meu painel", href: "/minha-fila" },
      { initials: "OS", label: "Ordens de serviço", href: "/os" },
    ] : []),
    ...(canInstallations ? [{ initials: "AG", label: "Agenda", href: "/instalacoes" }] : []),
    ...(canArt ? [{ initials: "AR", label: "Quadro de Arte", href: "/os/arte" }] : []),
    ...(canProduction ? [{ initials: "PR", label: "Produção", href: "/os/producao" }] : []),
    ...(canInstallations ? [{ initials: "IN", label: "Instalações", href: "/instalacoes" }] : []),
  ];

  const moreLinks = [
    ...(canAccessOperationalSection(access, "dashboard") ?
      [{ label: "Dashboard Operacional", href: "/hub-os" }] : []),
    ...(hubPermissions.canCreateOs && hasModuleAccess("orcamentista") ?
      [{ label: "Orçamentista", href: "/orcamentista" }] : []),
    ...(hasModuleAccess("impressao_estoque") ?
      [{ label: "Impressão & Estoque", href: "/impressao-estoque" }] : []),
    ...(hasModuleAccess("biblioteca_produtos") && hubPermissions.canCreateOs ?
      [{ label: "Biblioteca de Produtos", href: "/biblioteca" }] : []),
    ...(hasModuleAccess("hub_os_financeiro") ?
      [{ label: "Financeiro", href: "/hub-os/financeiro" }] : []),
    ...(hubPermissions.canManageUsers && hasModuleAccess("configuracoes") ?
      [{ label: "Gestão de usuários", href: "/configuracoes" }] : []),
    ...(canAccessOperationalSection(access, "deliveries") ?
      [{ label: "Entregas", href: "/entregas" }] : []),
    ...(hasModuleAccess("calculadora") ?
      [{ label: "Calculadora", href: "/calculadora" }] : []),
    ...(hasModuleAccess("galeria") ?
      [{ label: "Galeria", href: "/galeria" }] : []),
  ];

  const logo = (
    <Link href="/minha-fila" className="myq-shell__brand" aria-label="EvoluSystem — Meu painel"
      onClick={() => setMobileOpen(false)}>
      <span className="myq-shell__brand-mark">E</span>
      <span className="myq-shell__brand-name">Evolu <strong>System</strong></span>
    </Link>
  );
  const nav = (
    <nav className="myq-shell__navigation" aria-label="Navegação principal">
      {navItems.map(item =>
        <Link key={item.initials} href={item.href}
          aria-current={item.href === location && item.initials !== "AG" ? "page" : undefined}
          className={"myq-shell__nav-link " + (item.href === location && item.initials !== "AG" ? "myq-shell__nav-link--active" : "")}
          onClick={() => setMobileOpen(false)}>
          <span aria-hidden="true" className="myq-shell__nav-initials">{item.initials}</span>
          <span className="myq-shell__nav-label">{item.label}</span>
        </Link>
      )}
    </nav>
  );
  const avatar = avatarUrl ?
    <img src={avatarUrl} alt="" className="myq-shell__avatar-photo" /> :
    <span aria-hidden="true">{initial}</span>;

  return (
    <div className="myq-shell">
      <aside className="myq-shell__sidebar" aria-label="Menu lateral">
        <div className="myq-shell__brand-wrap">{logo}</div>
        {nav}
        <div className="myq-shell__account">
          <div className="myq-shell__account-row">
            <div className="myq-shell__account-avatar">{avatar}</div>
            <div className="myq-shell__account-text">
              <strong title={name}>{name}</strong>
              <span>{getRoleLabel(role)}</span>
            </div>
          </div>
          <p className="myq-shell__account-footnote">EvoluSystem · Ambiente operacional</p>
        </div>
      </aside>
      <div className="myq-shell__workspace">
        <header className="myq-shell__topbar">
          <div className="myq-shell__topbar-start">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button type="button" className="myq-shell__menu-button" aria-label="Abrir menu de navegação">
                  <Menu size={20} />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="myq-shell__mobile-sheet">
                <SheetTitle className="sr-only">Menu EvoluSystem</SheetTitle>
                <div className="myq-shell__brand-wrap">{logo}</div>
                {nav}
                <div className="myq-shell__mobile-bottom">{name} · {getRoleLabel(role)}</div>
              </SheetContent>
            </Sheet>
            <span className="myq-shell__breadcrumb">Início / Meu painel</span>
          </div>
          <div className="myq-shell__topbar-end">
            <span className="myq-shell__date">{formatHeaderDate()}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="myq-shell__profile-trigger" aria-label="Abrir menu da conta">
                  <span className="myq-shell__top-avatar">{avatar}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="myq-shell__user-menu">
                <div className="myq-shell__user-name">{name}<small>{getRoleLabel(role)}</small></div>
                <DropdownMenuSeparator />
                {moreLinks.map(item =>
                  <DropdownMenuItem asChild key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                )}
                <div className="myq-shell__notifications">
                  <span>Notificações</span><NotificationBell />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { void signOut(); }}>
                  <LogOut size={15} /> Sair do sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="myq-shell__content">{children}</main>
      </div>
    </div>
  );
}
