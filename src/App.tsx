import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import HubOS from "@/pages/HubOS";
// IMPORTANTE: Agora estamos importando o componente real!
import Materiais from "@/pages/Materiais"; 
import Configuracoes from "@/pages/Configuracoes";
import OsArteBoardPage from "@/modules/hub-os/pages/OsArteBoardPage";
import OsProducaoBoardPage from "@/modules/hub-os/pages/OsProducaoBoardPage";
import OsDetailPage from "@/modules/hub-os/pages/OsDetailPage";
import OsCreatePage from "@/modules/hub-os/pages/OsCreatePage";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";

function Router() {
  const { user, isAdmin } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      {/* Rota Principal */}
      <Route path="/">
        <Layout>
          <Home />
        </Layout>
      </Route>

      <Route path="/hub-os">
        <Layout>
          <HubOS />
        </Layout>
      </Route>
      
      {/* Rota de Materiais Corrigida */}
      <Route path="/materiais">
        <Layout>
          {/* Só permite acesso se for Admin, senão volta para a Home */}
          {isAdmin ? <Materiais /> : <Redirect to="/" />}
        </Layout>
      </Route>
      
      <Route path="/configuracoes">
  <Layout>
    {/* Se for Admin entra, se não for, é chutado para a Home */}
    {isAdmin ? <Configuracoes /> : <Redirect to="/" />}
  </Layout>
</Route>

      <Route path="/os">
        <Redirect to="/os/arte" />
      </Route>

      <Route path="/os/arte">
        <Layout>
          <OsArteBoardPage />
        </Layout>
      </Route>

      <Route path="/os/producao">
        <Layout>
          <OsProducaoBoardPage />
        </Layout>
      </Route>

      <Route path="/os/novo">
        <Layout>
          <OsCreatePage />
        </Layout>
      </Route>

      <Route path="/os/:id">
        <Layout>
          <OsDetailPage />
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
