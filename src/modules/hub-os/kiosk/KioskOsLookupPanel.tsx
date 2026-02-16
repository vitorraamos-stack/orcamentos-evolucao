import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sanitizeOsCode } from "../utils";

type KioskErrorType = "invalid_code" | "not_found" | "network" | "unknown";

type KioskOsLookupPanelProps = {
  onFoundCode: (sanitizedCode: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  loadingText?: string;
};

const isNetworkError = (error: unknown) => {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: string };
  return candidate.message?.toLowerCase().includes("network") ?? false;
};

export function KioskOsLookupPanel({
  onFoundCode,
  onCancel,
  autoFocus = false,
  loadingText = "Buscando OS...",
}: KioskOsLookupPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState<KioskErrorType | null>(null);

  const errorMessage = useMemo(() => {
    if (errorType === "invalid_code") return "Informe apenas o número da OS.";
    if (errorType === "not_found")
      return "OS não encontrada. Verifique o número da etiqueta.";
    if (errorType === "network") return "Falha de rede. Tente novamente.";
    if (errorType === "unknown")
      return "Erro ao consultar OS. Tente novamente.";
    return null;
  }, [errorType]);

  const focusInput = () => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  useEffect(() => {
    if (autoFocus) focusInput();
  }, [autoFocus]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const sanitizedCode = sanitizeOsCode(code);
    if (!sanitizedCode || !/^\d+$/.test(sanitizedCode)) {
      setCode("");
      setErrorType("invalid_code");
      toast.error("Informe apenas o número da OS.");
      focusInput();
      return;
    }

    try {
      setLoading(true);
      setErrorType(null);
      await onFoundCode(sanitizedCode);
      setCode("");
      toast.success("OS localizada com sucesso.");
    } catch (error) {
      console.error(error);
      setCode("");

      const message =
        error instanceof Error
          ? error.message
          : "Erro ao consultar OS. Tente novamente.";
      if (message.toLowerCase().includes("não encontrada")) {
        setErrorType("not_found");
      } else if (isNetworkError(error)) {
        setErrorType("network");
      } else {
        setErrorType("unknown");
      }

      toast.error(message);
      focusInput();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSearch}
      className="mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center gap-6"
    >
      <div className="space-y-2 text-center">
        <p className="text-4xl font-black tracking-wide sm:text-5xl">
          ESCANEIE A ETIQUETA
        </p>
        <p className="text-base text-muted-foreground sm:text-xl">
          ou digite o número da OS
        </p>
      </div>

      <Input
        ref={inputRef}
        value={code}
        onChange={event => setCode(event.target.value)}
        onFocus={event => event.currentTarget.select()}
        placeholder="Ex.: OS#85468"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={loading}
        className="h-20 w-full max-w-3xl rounded-2xl border-2 px-8 text-center text-3xl font-bold shadow-sm sm:h-24 sm:text-4xl"
      />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="h-14 min-w-44 text-xl font-extrabold tracking-wide"
        >
          {loading ? loadingText : "ADICIONAR OS"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-14 min-w-36 text-lg"
            onClick={onCancel}
          >
            Fechar
          </Button>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-6 py-3 text-center text-lg font-semibold text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
