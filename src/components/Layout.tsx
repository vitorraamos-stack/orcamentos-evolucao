import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentUserDisplayName } from "@/shared/users/userDisplay";
import { useAvatarPhoto } from "@/shared/users/avatarPhoto";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Calculator,
  LayoutDashboard,
  ClipboardList,
  Image,
  Palette,
  Factory,
  CalendarDays,
  CalendarClock,
  Truck,
  Package,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
  BadgeDollarSign,
  Printer,
  BookOpen,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import "./evolusystem-shell.css";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/hubRoles";
import { canAccessOperationalSection } from "@/lib/authz";
import { getOperationalNavState } from "./operationalNavState";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const {
    user,
    loading,
    signOut,
    isAdmin,
    role,
    hubPermissions,
    hasModuleAccess,
  } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hooks must run on every render, including loading and signed-out states.
  const avatarUrl = useAvatarPhoto(user?.id);
  const isCreateOrderPage = location.startsWith("/os/novo");
  const isOrdersCentralPage = location === "/os";
  const isOrderDetailPage = /^\/os\/[^/]+$/.test(location) &&
    !["/os/novo", "/os/arte", "/os/producao", "/os/insumos", "/os/kiosk"].includes(location);
  const isArtworkCentralPage = location.startsWith("/os/arte");
  const isProductionCentralPage = location.startsWith("/os/producao");
  const isInstallationsCentralPage = location === "/instalacoes";
  const isDeliveriesCentralPage = location === "/entregas";
  const operationalNav = getOperationalNavState(location);
  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  // Componente de navegação interno com tipos corretos
  const access = { hasModuleAccess, permissions: hubPermissions };
  const canViewHubOs = canAccessOperationalSection(access, "orders");
  const canViewDashboard = canAccessOperationalSection(access, "dashboard");
  const canViewArteBoard = canAccessOperationalSection(access, "art");
  const canViewProducaoBoard = canAccessOperationalSection(access, "production");
  const canViewInstallations = canAccessOperationalSection(access, "installations");
  const canViewDeliveries = canAccessOperationalSection(access, "deliveries");
  const canViewPrinting = hasModuleAccess("impressao_estoque");
  const canViewGaleria = hasModuleAccess("galeria");
  const canViewCalculadora = hasModuleAccess("calculadora");
  const canViewLibrary = hasModuleAccess("biblioteca_produtos") && hubPermissions.canCreateOs;
  const canManageLibrary = isAdmin && hasModuleAccess("biblioteca_gestao");
  const canViewOrcamentista =
    hubPermissions.canCreateOs && hasModuleAccess("orcamentista");
  const canViewMateriais = isAdmin && hasModuleAccess("materiais");
  const canViewConfiguracoes =
    hubPermissions.canManageUsers && hasModuleAccess("configuracoes");
  const canViewOperationalSettings =
    hubPermissions.canManageUsers && hasModuleAccess("hub_os") && hasModuleAccess("regras_operacionais");
  const canViewPricing = hubPermissions.canManageUsers && hasModuleAccess("precos_custos");
  const canViewFinanceiro = hasModuleAccess("hub_os_financeiro");
  // Os agrupamentos apenas organizam a navegação; os controles de acesso
  // continuam sendo os mesmos usados nas rotas de cada módulo.
  const hasCommercialModules = canViewOrcamentista || canViewCalculadora || canViewLibrary;
  const hasResourceModules = canViewGaleria || canViewMateriais;
  const hasManagementModules = canViewFinanceiro || canViewConfiguracoes || canViewOperationalSettings || canManageLibrary || canViewPricing;

  const operationalLinks = [
    ...(canViewDashboard ? [{ href: "/hub-os", label: "Dashboard", Icon: LayoutDashboard, active: location === "/hub-os" }] : []),
    ...(canViewHubOs ? [{ href: "/os", label: "Ordens de Serviço", Icon: ClipboardList, active: operationalNav.orders }] : []),
    ...(canViewArteBoard ? [{ href: "/os/arte", label: "Arte", Icon: Palette, active: operationalNav.art }] : []),
    ...(canViewProducaoBoard ? [{ href: "/os/producao", label: "Produção", Icon: Factory, active: operationalNav.production }] : []),
    ...(canViewInstallations
      ? [{ href: "/instalacoes", label: "Instalações", Icon: CalendarDays, active: location.startsWith("/instalacoes") }]
      : []),
    ...(canViewDeliveries
      ? [{ href: "/entregas", label: "Entregas", Icon: Truck, active: location.startsWith("/entregas") }]
      : []),
  ];

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <h2 className="evolu-nav__section px-3 pb-2 pt-3 font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">
      {children}
    </h2>
  );

  const NavItems = () => (
    <div className="space-y-1">
      {(operationalLinks.length > 0 || canViewPrinting) && (
        <>
          <SectionLabel>Operação</SectionLabel>
          {operationalLinks.map(({ href, label, Icon, active }) => (
            <Link href={href} key={href}>
              <Button
                variant={active ? "secondary" : "ghost"}
                className={cn(
                  "evolu-nav__item w-full justify-start",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Button>
            </Link>
          ))}
          {canViewPrinting && (
            <Link href="/impressao-estoque">
              <Button
                variant={location.startsWith("/impressao-estoque") ? "secondary" : "ghost"}
                className={cn(
                  "evolu-nav__item w-full justify-start",
                  location.startsWith("/impressao-estoque") && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Printer className="mr-2 h-4 w-4" />
                Impressão & Estoque
              </Button>
            </Link>
          )}
        </>
      )}

      {hasCommercialModules && <SectionLabel>Comercial</SectionLabel>}

      {canViewOrcamentista && (
        <Link href="/orcamentista">
          <Button
            variant={location.startsWith("/orcamentista") ? "secondary" : "ghost"}
            className={cn(
              "evolu-nav__item w-full justify-start",
              location.startsWith("/orcamentista") &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Orçamentista
          </Button>
        </Link>
      )}

      {canViewCalculadora && (
        <Link href="/calculadora">
          <Button
            variant={location === "/calculadora" ? "secondary" : "ghost"}
            className={cn(
              "evolu-nav__item w-full justify-start",
              location === "/calculadora" &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Calculadora
          </Button>
        </Link>
      )}

      {canViewLibrary && (
        <Link href="/biblioteca">
          <Button
            variant={location === "/biblioteca" ? "secondary" : "ghost"}
            className={cn("evolu-nav__item w-full justify-start",location === "/biblioteca" && "bg-sidebar-accent text-sidebar-accent-foreground")}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            Biblioteca de Produtos
          </Button>
        </Link>
      )}

      {hasResourceModules && <SectionLabel>Recursos</SectionLabel>}

      {canViewGaleria && (
        <Link href="/galeria">
          <Button
            variant={location === "/galeria" ? "secondary" : "ghost"}
            className={cn(
              "evolu-nav__item w-full justify-start",
              location === "/galeria" &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Image className="mr-2 h-4 w-4" />
            Galeria
          </Button>
        </Link>
      )}

      {canViewMateriais && (
        <Link href="/materiais">
          <Button
            variant={location === "/materiais" ? "secondary" : "ghost"}
            className={cn(
              "evolu-nav__item w-full justify-start",
              location === "/materiais" &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Package className="mr-2 h-4 w-4" />
            Materiais
          </Button>
        </Link>
      )}

      {hasManagementModules && (
        <div className="mt-3 border-t border-sidebar-border/50 pt-3">
          <SectionLabel>Administração</SectionLabel>
          {canViewFinanceiro && (
            <Link href="/hub-os/financeiro">
              <Button
                variant={location.startsWith("/hub-os/financeiro") ? "secondary" : "ghost"}
                className={cn(
                  "evolu-nav__item w-full justify-start",
                  location.startsWith("/hub-os/financeiro") &&
                    "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <BadgeDollarSign className="mr-2 h-4 w-4" />
                Financeiro
              </Button>
            </Link>
          )}

          {canManageLibrary && (
            <Link href="/biblioteca/gestao">
              <Button
                variant={location.startsWith("/biblioteca/gestao") ? "secondary" : "ghost"}
                className={cn("evolu-nav__item w-full justify-start",location.startsWith("/biblioteca/gestao") && "bg-sidebar-accent text-sidebar-accent-foreground")}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Gestão da Biblioteca
              </Button>
            </Link>
          )}

          {(canViewConfiguracoes || canViewPricing || canViewOperationalSettings) && (
            <>
              {canViewPricing && <Link href="/configuracoes/precos">
                <Button
                  variant={location === "/configuracoes/precos" ? "secondary" : "ghost"}
                  className={cn(
                    "evolu-nav__item w-full justify-start",
                    location === "/configuracoes/precos" &&
                      "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Preços e Custos
                </Button>
              </Link>}
              {canViewOperationalSettings && (
                <Link href="/configuracoes/regras-operacionais">
                  <Button
                    variant={location === "/configuracoes/regras-operacionais" ? "secondary" : "ghost"}
                    className={cn(
                      "evolu-nav__item w-full justify-start",
                      location === "/configuracoes/regras-operacionais" &&
                        "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Regras Operacionais
                  </Button>
                </Link>
              )}
              {canViewConfiguracoes && <Link href="/configuracoes">
                <Button
                  variant={location === "/configuracoes" ? "secondary" : "ghost"}
                  className={cn(
                    "evolu-nav__item w-full justify-start",
                    location === "/configuracoes" &&
                      "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Usuários
                </Button>
              </Link>}
            </>
          )}
        </div>
      )}
    </div>
  );

  const displayName = getCurrentUserDisplayName(user);
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className={cn(
      "evolu-shell flex min-h-dvh bg-[#F4F7FB] text-foreground dark:bg-background",
      isCreateOrderPage ? "md:h-auto md:overflow-visible" : "md:h-dvh md:overflow-hidden",
      isCreateOrderPage && "evolu-shell--create-order",
      isOrderDetailPage && "evolu-shell--order-detail h-dvh overflow-hidden"
    )}>
      <aside className="evolu-shell__sidebar hidden w-[264px] shrink-0 flex-col text-white md:flex" aria-label="Menu lateral">
        <div className="evolu-shell__branding">
          <img src="/evolusystem-logo-dark.svg" alt="EvoluSystem" className="evolu-shell__brand-logo" />
        </div>
        <nav className="evolu-shell__navigation min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Navegação principal">
          <NavItems />
        </nav>
        <div className="evolu-shell__account px-3 py-4">
          <div className="flex items-center gap-3 px-2 pb-3">
            <div className="evolu-shell__avatar">
              {avatarUrl
                ? <img className="h-full w-full object-cover" src={avatarUrl} alt={`Foto de ${displayName}`} />
                : <span aria-hidden="true">{initial}</span>}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="truncate text-xs text-[#9BB6D3]">{getRoleLabel(role)}</p>
            </div>
          </div>
          <Button variant="ghost" className="evolu-shell__signout flex w-full items-center justify-start" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair do sistema
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="evolu-shell__topbar z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[#E5EAF2] bg-white px-4 md:hidden dark:border-border dark:bg-card">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl border border-[#DDE6F0] md:hidden" aria-label="Abrir menu de navegação">
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(85vw,300px)] gap-0 border-r-0 bg-[#071A34] p-0 text-white">
                <SheetTitle className="sr-only">Menu do EvoluSystem</SheetTitle>
                <div className="evolu-shell__branding shrink-0">
                  <img src="/evolusystem-logo-dark.svg" alt="EvoluSystem" className="evolu-shell__brand-logo" />
                </div>
                <nav
                  aria-label="Navegação principal"
                  className="evolu-shell__navigation min-h-0 flex-1 overflow-y-auto px-3 py-3"
                  onClickCapture={event => {
                    if ((event.target as HTMLElement).closest("a[href]")) setMobileOpen(false);
                  }}
                >
                  <NavItems />
                </nav>
                <div className="evolu-shell__account shrink-0 px-3 py-4">
                  <p className="mb-3 truncate px-2 text-xs text-[#C2D2E5]">{displayName}</p>
                  <Button variant="ghost" className="evolu-shell__signout w-full justify-start" onClick={() => { setMobileOpen(false); void signOut(); }}>
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair do sistema
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <img src="/evolusystem-logo.svg" alt="EvoluSystem" className="h-auto w-[180px] max-w-full" />
              <p className="truncate text-[10px] font-semibold uppercase tracking-[.14em] text-[#71839A]">
                Controle Operacional
              </p>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "evolu-shell__main min-h-0 flex-1 p-4 md:p-5 xl:p-6",
            isCreateOrderPage ? "overflow-visible" : isOrderDetailPage ? "overflow-y-auto overflow-x-hidden" : "overflow-auto"
          )}
        >
          <div
            className={cn(
              "mx-auto flex w-full min-h-0 flex-col",
              isOrdersCentralPage ||
                isCreateOrderPage ||
                isOrderDetailPage ||
                isInstallationsCentralPage ||
                isDeliveriesCentralPage ||
                isArtworkCentralPage ||
                isProductionCentralPage ||
                location === "/hub-os" ||
                location === "/configuracoes"
                ? "max-w-none"
                : location === "/impressao-estoque"
                  ? "max-w-[1520px]"
                  : "max-w-6xl",
              isCreateOrderPage ? "h-auto" : "h-full"
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
