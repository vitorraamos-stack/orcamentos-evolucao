import { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useClock, useFullscreen, useOnlineStatus } from './hooks';

type KioskShellProps = {
  title: string;
  subtitle?: string;
  statusMessage?: string;
  children: ReactNode;
  onBackgroundInteract?: () => void;
  headerAction?: ReactNode;
  mainClassName?: string;
};

const shortcuts = [
  { key: 'Enter', label: 'Buscar' },
  { key: 'Esc', label: 'Limpar' },
  { key: '⛶', label: 'Tela cheia' },
];

export function KioskShell({
  title,
  subtitle,
  statusMessage,
  children,
  onBackgroundInteract,
  headerAction,
  mainClassName,
}: KioskShellProps) {
  const isOnline = useOnlineStatus();
  const time = useClock();
  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen();

  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col overflow-hidden bg-background"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onBackgroundInteract?.();
      }}
    >
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {headerAction}
          <Badge variant={isOnline ? 'secondary' : 'destructive'}>{isOnline ? 'Online' : 'Offline'}</Badge>
          <Badge variant="outline" className="font-mono text-sm">
            {time}
          </Badge>
          <Button
            size="lg"
            variant={isFullscreen ? 'outline' : 'default'}
            onClick={() => (isFullscreen ? exitFullscreen() : enterFullscreen())}
          >
            {isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
          </Button>
        </div>
      </header>

      <main
        className={cn('flex min-h-0 flex-1 items-center justify-center px-4 py-6 sm:px-8', mainClassName)}
        onMouseDown={() => onBackgroundInteract?.()}
      >
        {children}
      </main>

      <footer className="sticky bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {shortcuts.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{item.key}</span>
                {item.label}
              </span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{statusMessage ?? 'Aguardando leitura...'}</p>
        </div>
      </footer>
    </div>
  );
}
