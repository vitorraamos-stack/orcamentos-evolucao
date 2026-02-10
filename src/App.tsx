import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import HubOS from "@/pages/HubOS";
import Galeria from "@/pages/Galeria";
// IMPORTANTE: Agora estamos importando o componente real!
import Materiais from "@/pages/Materiais"; 
import Configuracoes from "@/pages/Configuracoes";
import OsArteBoardPage from "@/modules/hub-os/pages/OsArteBoardPage";
import OsProducaoBoardPage from "@/modules/hub-os/pages/OsProducaoBoardPage";
import OsDetailPage from "@/modules/hub-os/pages/OsDetailPage";
import OsCreatePage from "@/modules/hub-os/pages/OsCreatePage";
import OsAuditPage from "@/modules/hub-os/pages/OsAuditPage";
import OsPendentesPage from "@/modules/hub-os/pages/OsPendentesPage";
import FinanceiroPortalPage from "@/modules/hub-os/pages/FinanceiroPortalPage";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import HubOsAccessGuard from "./components/HubOsAccessGuard";
import RequireModule from "./components/RequireModule";

function Router() {
  const { isAdmin, hubPermissions } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      {/* Rota Principal */}
      <Route path="/">
        <Layout>
          <RequireModule moduleKey="calculadora">
            <Home />
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/hub-os">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <HubOS />
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/hub-os/auditoria">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <HubOsAccessGuard scope="audit"><OsAuditPage /></HubOsAccessGuard>
          </RequireModule>
        </Layout>
      </Route>


      <Route path="/hub-os/pendentes">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <OsPendentesPage />
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/financeiro">
        <Layout>
          <RequireModule moduleKey="hub_os_financeiro">
            <FinanceiroPortalPage />
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/hub-os/financeiro">
        <Layout>
          <RequireModule moduleKey="hub_os_financeiro">
            <FinanceiroPortalPage />
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/galeria">
        <Layout>
          <RequireModule moduleKey="galeria">
            <Galeria />
          </RequireModule>
        </Layout>
      </Route>
      
      {/* Rota de Materiais Corrigida */}
      <Route path="/materiais">
        <Layout>
          {/* Só permite acesso se for Admin, senão volta para a Home */}
          <RequireModule moduleKey="materiais">
            {isAdmin ? <Materiais /> : <Redirect to="/" />}
          </RequireModule>
        </Layout>
      </Route>
      
      <Route path="/configuracoes">
        <Layout>
          <RequireModule moduleKey="configuracoes">
            {/* Se for Admin entra, se não for, é chutado para a Home */}
            {hubPermissions.canManageUsers ? <Configuracoes /> : <Redirect to="/" />}
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/os">
        <Redirect to="/os/arte" />
      </Route>

      <Route path="/os/arte">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <HubOsAccessGuard scope="arte"><OsArteBoardPage /></HubOsAccessGuard>
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/os/producao">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <HubOsAccessGuard scope="producao"><OsProducaoBoardPage /></HubOsAccessGuard>
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/os/novo">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <HubOsAccessGuard scope="create"><OsCreatePage /></HubOsAccessGuard>
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/os/:id">
        <Layout>
          <RequireModule moduleKey="hub_os">
            <OsDetailPage />
          </RequireModule>
        </Layout>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
