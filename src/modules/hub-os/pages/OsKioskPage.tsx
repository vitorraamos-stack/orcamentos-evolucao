import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchOsByCode } from '../api';
import { sanitizeOsCode } from '../utils';

type KioskErrorType = 'invalid_code' | 'not_found' | 'session' | 'network' | 'unknown';

const isSessionError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; message?: string };
  return (
    candidate.status === 401 ||
    candidate.message?.toLowerCase().includes('jwt') ||
    candidate.message?.toLowerCase().includes('session')
  );
};

const isNetworkError = (error: unknown) => {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: string };
  return candidate.message?.toLowerCase().includes('network') ?? false;
};

export default function OsKioskPage() {
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<KioskErrorType | null>(null);

  const errorMessage = useMemo(() => {
    if (errorType === 'invalid_code') return 'Informe apenas o número da OS.';
    if (errorType === 'not_found') return 'OS não encontrada. Verifique o número da etiqueta.';
    if (errorType === 'session') return 'Sessão expirada. Faça login novamente.';
    if (errorType === 'network') return 'Falha de rede. Tente novamente.';
    if (errorType === 'unknown') return 'Erro ao consultar OS. Tente novamente.';
    return null;
  }, [errorType]);

  const focusInput = () => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  useEffect(() => {
    focusInput();
  }, []);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const sanitizedCode = sanitizeOsCode(code);
    if (!sanitizedCode) {
      setCode('');
      setErrorType('invalid_code');
      toast.error('Informe apenas o número da OS.');
      focusInput();
      return;
    }

    try {
      setLoading(true);
      setErrorType(null);
      if (!/^\d+$/.test(sanitizedCode)) {
        setCode('');
        setErrorType('invalid_code');
        toast.error('Informe apenas o número da OS.');
        focusInput();
        return;
      }

      const foundOrder = await fetchOsByCode(sanitizedCode);

      if (!foundOrder) {
        setCode('');
        setErrorType('not_found');
        toast.error('OS não encontrada. Verifique o número da etiqueta.');
        focusInput();
        return;
      }

      if (foundOrder.source === 'os_orders') {
        setLocation(`/hub-os?search=${encodeURIComponent(sanitizedCode)}&openOrderId=${encodeURIComponent(foundOrder.id)}&kiosk=1`);
        return;
      }

      setLocation(`/os/${foundOrder.id}?kiosk=1`);
    } catch (error) {
      console.error(error);
      setCode('');

      if (isSessionError(error)) {
        setErrorType('session');
        toast.error('Sessão expirada. Faça login novamente.');
      } else if (isNetworkError(error)) {
        setErrorType('network');
        toast.error('Falha de rede. Tente novamente.');
      } else {
        setErrorType('unknown');
        toast.error('Erro ao consultar OS. Tente novamente.');
      }

      focusInput();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl">Modo quiosque · Acabamento</CardTitle>
          <p className="text-sm text-muted-foreground">Digite ou escaneie o número da OS e pressione Enter.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-3">
            <Input
              ref={inputRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Ex.: OS#85468"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={loading}
              className="h-16 text-center text-2xl font-semibold"
            />
            {errorMessage ? <p className="text-center text-sm text-destructive">{errorMessage}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
