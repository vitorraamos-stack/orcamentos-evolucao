import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAuditEvents, fetchAuditUsers } from '@/features/hubos/api';
import type { OsOrderEvent } from '@/features/hubos/types';

const EVENT_OPTIONS = [
  { value: 'status_change', label: 'Mudança de Status' },
  { value: 'archive', label: 'Arquivamento' },
  { value: 'delete', label: 'Exclusão' },
];

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const formatUser = (event: OsOrderEvent) =>
  event.profile?.full_name || event.profile?.email || event.created_by || '—';

const formatOs = (event: OsOrderEvent) => {
  if (event.os) {
    return `#${event.os.sale_number ?? '—'} • ${event.os.client_name}`;
  }
  const payload = event.payload as Record<string, unknown> | null;
  const previous = payload?.previous as Record<string, unknown> | undefined;
  if (previous) {
    const saleNumber = previous.sale_number ? `#${previous.sale_number}` : '#—';
    const clientName = previous.client_name ?? '—';
    return `${saleNumber} • ${clientName}`;
  }
  return '—';
};

const formatDetails = (event: OsOrderEvent) => {
  const payload = event.payload as Record<string, unknown> | null;
  if (event.type === 'status_change') {
    const board = payload?.board === 'arte' ? 'Arte' : payload?.board === 'producao' ? 'Produção' : 'Hub';
    const from = payload?.from ?? '—';
    const to = payload?.to ?? '—';
    return `${board}: ${from} → ${to}`;
  }
  if (event.type === 'archive') {
    return 'Card arquivado.';
  }
  if (event.type === 'delete') {
    return 'Exclusão manual.';
  }
  return JSON.stringify(payload ?? {});
};

const toStartOfDay = (value: string) => new Date(`${value}T00:00:00`).toISOString();
const toEndOfDay = (value: string) => new Date(`${value}T23:59:59.999`).toISOString();

export default function OsAuditPage() {
  const { isAdmin, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [events, setEvents] = useState<OsOrderEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    userId: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [users, setUsers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!isAdmin) {
      toast.error('Você não tem permissão para acessar a auditoria.');
      setLocation('/hub-os');
    }
  }, [isAdmin, loading, setLocation]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingUsers(true);
      const data = await fetchAuditUsers();
      setUsers(data);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar os usuários.');
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  const loadEvents = useCallback(
    async (reset = false) => {
      if (!isAdmin) return;
      try {
        setLoadingEvents(true);
        const offset = reset ? 0 : events.length;
        const { data, count } = await fetchAuditEvents({
          search: filters.search || undefined,
          type: filters.type === 'all' ? undefined : filters.type,
          userId: filters.userId === 'all' ? undefined : filters.userId,
          dateFrom: filters.dateFrom ? toStartOfDay(filters.dateFrom) : undefined,
          dateTo: filters.dateTo ? toEndOfDay(filters.dateTo) : undefined,
          limit: 50,
          offset,
        });
        setEvents((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(offset + data.length < count);
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível carregar a auditoria.');
      } finally {
        setLoadingEvents(false);
      }
    },
    [events.length, filters, isAdmin]
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!isAdmin) return;
    loadEvents(true);
  }, [filters, isAdmin, loadEvents]);

  const userOptions = useMemo(() => users.filter((user) => user.full_name || user.email), [users]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Auditoria — Movimentações</h1>
        <p className="text-sm text-muted-foreground">
          Visualize todas as movimentações e ações realizadas pelos usuários no Hub OS.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Buscar OS, cliente ou título..."
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
        />
        <Select
          value={filters.type}
          onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {EVENT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.userId}
          onValueChange={(value) => setFilters((prev) => ({ ...prev, userId: value }))}
          disabled={loadingUsers}
        >
          <SelectTrigger>
            <SelectValue placeholder={loadingUsers ? 'Carregando usuários...' : 'Usuário'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {userOptions.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.full_name || user.email || user.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingEvents &&
              [...Array(5)].map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loadingEvents && events.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma movimentação encontrada.
                </TableCell>
              </TableRow>
            )}
            {!loadingEvents &&
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{formatDateTime(event.created_at)}</TableCell>
                  <TableCell>{formatUser(event)}</TableCell>
                  <TableCell>{formatOs(event)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{event.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDetails(event)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-center">
        {hasMore && (
          <Button variant="outline" onClick={() => loadEvents(false)} disabled={loadingEvents}>
            Carregar mais
          </Button>
        )}
      </div>
    </div>
  );
}
