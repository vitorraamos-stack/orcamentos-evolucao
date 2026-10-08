import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
  Truck,
  Package,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
  BadgeDollarSign,
  FileText,
  FilePlus2,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import "./evolusystem-shell.css";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/hubRoles";
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
  const isCreateOrderPage = location.startsWith("/os/novo");
  const isOrdersCentralPage = location === "/os";
  const isArtworkCentralPage = location.startsWith("/os/arte");
  const isProductionCentralPage = location.startsWith("/os/producao");
  const isInstallationsCentralPage = location === "/instalacoes";
  const isDeliveriesCentralPage = location === "/entregas";
  const operationalNav = getOperationalNavState(location);
  const activePageLabel = operationalNav.art ? "Arte"
    : operationalNav.production ? "Produção"
    : location === "/hub-os" ? "Dashboard"
    : location.startsWith("/os") ? "Ordens de serviço"
    : location.startsWith("/instalacoes") ? "Instalações"
    : location.startsWith("/entregas") ? "Entregas"
    : location.startsWith("/orcamentos") ? "Orçamentos"
    : location.startsWith("/orcamentista") ? "Novo orçamento"
    : location.startsWith("/galeria") ? "Galeria"
    : location.startsWith("/materiais") ? "Materiais"
    : location.startsWith("/configuracoes") ? "Configurações"
    : location.includes("financeiro") ? "Financeiro"
    : location === "/" ? "Calculadora"
    : "Controle operacional";

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
  const canViewHubOs = hubPermissions.canViewHubOS && hasModuleAccess("hub_os");
  const canViewGaleria = hasModuleAccess("galeria");
  const canViewCalculadora = hasModuleAccess("calculadora");
  const canViewOrcamentista =
    hubPermissions.canCreateOs && canViewCalculadora;
  const canViewMateriais = isAdmin && hasModuleAccess("materiais");
  const canViewConfiguracoes =
    hubPermissions.canManageUsers && hasModuleAccess("configuracoes");
  const canViewFinanceiro = hasModuleAccess("hub_os_financeiro");
  const hasOtherModules =
    canViewFinanceiro ||
    canViewGaleria ||
    canViewCalculadora ||
    canViewMateriais;

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="evolu-nav__section px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">
      {children}
    </p>
  );

  const NavItems = () => (
    <div className="space-y-1">
      {canViewHubOs && (
        <>
          <SectionLabel>Operação</SectionLabel>
          {[
            ["/hub-os", "Dashboard", LayoutDashboard],
            ["/os", "Ordens de Serviço", ClipboardList],
            ...(hubPermissions.canViewInstallations
              ? [["/instalacoes", "Instalações", CalendarDays]]
              : []),
            ...(hubPermissions.canViewDeliveries
              ? [["/entregas", "Entregas", Truck]]
              : []),
          ].map(([href, label, Icon]) => (
            <Link href={href as string} key={href as string}>
              <Button
                variant={
                  (
                    href === "/hub-os"
                      ? location === href
                      : href === "/os"
                        ? operationalNav.orders
                        : location.startsWith(href as string)
                  )
                    ? "secondary"
                    : "ghost"
                }
                className={cn(
                  "evolu-nav__item w-full justify-start",
                  (href === "/hub-os"
                    ? location === href
                    : href === "/os"
                      ? operationalNav.orders
                      : location.startsWith(href as string)) &&
                    "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {label as string}
              </Button>
            </Link>
          ))}
          {(
            [
              ["/os/arte", "Arte", Palette],
              ["/os/producao", "Produção", Factory],
            ] as const
          ).map(([href, label, Icon]) => (
            <Link href={href} key={href}>
              <Button
                variant={
                  (
                    href === "/os/arte"
                      ? operationalNav.art
                      : operationalNav.production
                  )
                    ? "secondary"
                    : "ghost"
                }
                className={cn(
                  "evolu-nav__item w-full justify-start",
                  (href === "/os/arte"
                    ? operationalNav.art
                    : operationalNav.production) &&
                    "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Button>
            </Link>
          ))}
        </>
      )}

      {hasOtherModules && <SectionLabel>Outros módulos</SectionLabel>}

      {canViewFinanceiro && (
        <Link href="/hub-os/financeiro">
          <Button
            variant={
              location.startsWith("/hub-os/financeiro") ? "secondary" : "ghost"
            }
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

      {canViewOrcamentista && (
        <>
          <Link href="/orcamentos">
            <Button
              variant={location.startsWith("/orcamentos") ? "secondary" : "ghost"}
              className={cn(
                "evolu-nav__item w-full justify-start",
                location.startsWith("/orcamentos") &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <FileText className="mr-2 h-4 w-4" />
              Orçamentos
            </Button>
          </Link>
          <Link href="/orcamentista">
            <Button
              variant={location.startsWith("/orcamentista") ? "secondary" : "ghost"}
              className={cn(
                "evolu-nav__item w-full justify-start",
                location.startsWith("/orcamentista") &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              Novo orçamento
            </Button>
          </Link>
        </>
      )}

      {canViewCalculadora && (
        <Link href="/">
          <Button
            variant={location === "/" ? "secondary" : "ghost"}
            className={cn(
              "evolu-nav__item w-full justify-start",
              location === "/" &&
                "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Calculadora
          </Button>
        </Link>
      )}

      {canViewMateriais && (
        <>
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
        </>
      )}

      {canViewConfiguracoes && (
        <div className="mt-3 border-t border-sidebar-border/50 pt-3">
          <SectionLabel>Administração</SectionLabel>
          <Link href="/configuracoes/precos">
            <Button
              variant={
                location === "/configuracoes/precos" ? "secondary" : "ghost"
              }
              className={cn(
                "evolu-nav__item w-full justify-start",
                location === "/configuracoes/precos" &&
                  "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Preços e Custos
            </Button>
          </Link>
          <Link href="/configuracoes">
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
          </Link>
        </div>
      )}
    </div>
  );

  const initial = (user.email?.trim().charAt(0) || "E").toUpperCase();

  return (
    <div className={cn(
      "evolu-shell flex min-h-dvh bg-[#F4F7FB] text-foreground dark:bg-background",
      isCreateOrderPage ? "md:h-auto md:overflow-visible" : "md:h-dvh md:overflow-hidden"
    )}>
      <aside className="evolu-shell__sidebar hidden w-[264px] shrink-0 flex-col text-white md:flex" aria-label="Menu lateral">
        <div className="evolu-shell__branding">
          <img src="/logo-branca.png" alt="Evolução Comunicação Visual" className="evolu-shell__company-logo" />
          <div className="evolu-shell__brand-name">Evolu<span>System</span></div>
          <p className="evolu-shell__brand-description">Controle Operacional</p>
          <div className="evolu-shell__cmyk" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <nav className="evolu-shell__navigation min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Navegação principal">
          <NavItems />
        </nav>
        <div className="evolu-shell__account px-3 py-4">
          <div className="flex items-center gap-3 px-2 pb-3">
            <div className="evolu-shell__avatar" aria-hidden="true">{initial}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.email}</p>
              <p className="truncate text-xs text-[#9BB6D3]">{getRoleLabel(role)}</p>
            </div>
          </div>
          <Button variant="ghost" className="evolu-shell__signout flex w-full items-center justify-start" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair do sistema
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="evolu-shell__topbar z-30 flex h-[70px] shrink-0 items-center justify-between gap-4 border-b border-[#E5EAF2] bg-white px-4 sm:px-6 lg:px-8 dark:border-border dark:bg-card">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl border border-[#DDE6F0] md:hidden" aria-label="Abrir menu de navegação">
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(85vw,300px)] gap-0 border-r-0 bg-[#071A34] p-0 text-white">
                <SheetTitle className="sr-only">Menu do EvoluSystem</SheetTitle>
                <div className="evolu-shell__branding shrink-0">
                  <img src="/logo-branca.png" alt="Evolução Comunicação Visual" className="evolu-shell__company-logo" />
                  <div className="evolu-shell__brand-name">Evolu<span>System</span></div>
                  <p className="evolu-shell__brand-description">Controle Operacional</p>
                  <div className="evolu-shell__cmyk" aria-hidden="true"><i /><i /><i /></div>
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
                  <p className="mb-3 truncate px-2 text-xs text-[#C2D2E5]">{user.email}</p>
                  <Button variant="ghost" className="evolu-shell__signout w-full justify-start" onClick={() => { setMobileOpen(false); void signOut(); }}>
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair do sistema
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="hidden text-[11px] font-bold uppercase tracking-[.2em] text-[#8795A8] sm:block">EvoluSystem / Área de trabalho</p>
              <p className="truncate text-base font-semibold tracking-[-.02em] text-[#172D49] sm:text-lg dark:text-foreground">{activePageLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden max-w-56 truncate text-right text-xs text-[#6A7E94] lg:block">{user.email}</span>
            <div className="evolu-shell__topbar-avatar" title={getRoleLabel(role)} aria-label={"Usuário: " + (user.email || "autenticado")}>{initial}</div>
          </div>
        </header>

        <main
          className={cn(
            "evolu-shell__main min-h-0 flex-1 p-4 md:p-6 xl:p-8",
            isCreateOrderPage ? "overflow-visible" : "overflow-auto"
          )}
        >
          <div
            className={cn(
              "mx-auto flex w-full min-h-0 flex-col",
              isOrdersCentralPage ||
                isInstallationsCentralPage ||
                isDeliveriesCentralPage ||
                isArtworkCentralPage ||
                isProductionCentralPage ||
                location === "/hub-os"
                ? "max-w-none"
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
