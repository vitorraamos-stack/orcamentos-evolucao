import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  Calculator, 
  LogOut, 
  Printer,
  Menu,
  Settings,
  Bug,
  ShieldCheck,
  ShieldAlert,
  LayoutGrid,
  Factory
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// Versão para controle de cache
const APP_VERSION = "v1.5 (Admin Fix)";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/login');
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    if (!loading && user && isAdmin) {
      console.log('Layout: User is Admin, Settings button should be visible');
    }
  }, [isAdmin, loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  // Função auxiliar para renderizar os itens de menu
  const renderNavItems = () => (
    <div className="space-y-1">
      <Button 
        variant={location === '/' ? 'secondary' : 'ghost'} 
        className={cn("w-full justify-start", location === '/' && "bg-sidebar-accent text-sidebar-accent-foreground")}
        onClick={() => setLocation('/')}
      >
        <Calculator className="mr-2 h-4 w-4" />
        Calculadora
      </Button>
      
      <Button 
        variant={location === '/materiais' ? 'secondary' : 'ghost'} 
        className={cn("w-full justify-start", location === '/materiais' && "bg-sidebar-accent text-sidebar-accent-foreground")}
        onClick={() => setLocation('/materiais')}
      >
        <Package className="mr-2 h-4 w-4" />
        Materiais
      </Button>

      <div className="pt-2 pb-1">
        <p className="px-2 text-xs font-semibold text-muted-foreground mb-1">
          Hub OS
        </p>
        <Button
          variant={location === '/hub-os/arte' ? 'secondary' : 'ghost'}
          className={cn(
            "w-full justify-start",
            location === '/hub-os/arte' && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          onClick={() => setLocation('/hub-os/arte')}
        >
          <LayoutGrid className="mr-2 h-4 w-4" />
          Arte
        </Button>
        <Button
          variant={location === '/hub-os/producao' ? 'secondary' : 'ghost'}
          className={cn(
            "w-full justify-start",
            location === '/hub-os/producao' && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          onClick={() => setLocation('/hub-os/producao')}
        >
          <Factory className="mr-2 h-4 w-4" />
          Produção
        </Button>
      </div>
      
      {/* 
        MODIFICAÇÃO DE DEBUG:
        Removemos a condicional {isAdmin && ...} para forçar o botão a aparecer.
        Agora ele mostra visualmente se está habilitado ou não.
        Isso confirma se o problema é lógica ou cache.
      */}
      <div className="pt-2 pb-1">
        <p className="px-2 text-xs font-semibold text-muted-foreground mb-1">
          Administração
        </p>
        <Button 
          variant={location === '/settings' ? 'secondary' : 'ghost'} 
          className={cn(
            "w-full justify-start", 
            location === '/settings' && "bg-sidebar-accent text-sidebar-accent-foreground",
            !isAdmin && "opacity-75"
          )}
          onClick={() => {
            if (isAdmin) {
              setLocation('/settings');
            } else {
              alert('O sistema ainda não reconheceu seu acesso Admin. Tente recarregar a página.');
            }
          }}
        >
          <Settings className="mr-2 h-4 w-4" />
          Configurações
          {isAdmin ? (
            <ShieldCheck className="ml-auto h-3 w-3 text-green-500" />
          ) : (
            <ShieldAlert className="ml-auto h-3 w-3 text-orange-500" />
          )}
        </Button>
      </div>

      <Button 
        variant={location === '/debug' ? 'secondary' : 'ghost'} 
        className={cn("w-full justify-start text-orange-500 mt-4", location === '/debug' && "bg-sidebar-accent text-sidebar-accent-foreground")}
        onClick={() => setLocation('/debug')}
      >
        <Bug className="mr-2 h-4 w-4" />
        Debug Info
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-6 flex items-center space-x-2 border-b border-sidebar-border/50">
          <Printer className="h-6 w-6 text-sidebar-primary" />
          <span className="font-bold text-lg tracking-tight">Evolução</span>
        </div>
        
        <div className="flex-1 p-4">
          {renderNavItems()}
        </div>

        <div className="p-4 border-t border-sidebar-border/50">
          <div className="flex items-center mb-4 px-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-bold mr-3">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground truncate">
                  {isAdmin ? 'Administrador' : 'Consultor'}
                </p>
                <span className="text-[10px] text-muted-foreground/50 ml-auto">
                  {APP_VERSION}
                </span>
              </div>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col min-w-0">


        <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center space-x-2">
            <Printer className="h-6 w-6 text-primary" />
            <span className="font-bold">Evolução</span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0">
              <div className="p-6 flex items-center space-x-2 border-b border-sidebar-border/50">
                <Printer className="h-6 w-6 text-sidebar-primary" />
                <span className="font-bold text-lg">Evolução</span>
              </div>
              <div className="p-4">
                {renderNavItems()}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border/50">
                <div className="px-2 mb-2 text-[10px] text-center text-muted-foreground">
                  {APP_VERSION}
                </div>
                <Button variant="outline" className="w-full justify-start" onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
