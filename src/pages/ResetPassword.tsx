import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setHasSession(Boolean(session));
      setChecking(false);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setHasSession(!error && Boolean(data.session));
        setChecking(false);
      })
      .catch(() => { if (active) setChecking(false); });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    if (password !== confirmation) {
      setFeedback('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success('Senha redefinida. Entre com sua nova senha.');
      setLocation('/login');
    } catch {
      setFeedback('Não foi possível redefinir sua senha. Solicite um novo link e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-4 py-10 text-[#102038]">
      <section className="w-full max-w-md rounded-[28px] border border-[#E8EDF4] bg-white px-6 py-10 shadow-xl sm:px-10">
        <img src="/logo.png" alt="Evolução Comunicação Visual" className="mx-auto mb-7 h-20 w-auto" />
        <h1 className="text-center text-3xl font-extrabold tracking-[-.05em]">
          Evolu<span className="text-[#008DE1]">System</span>
        </h1>
        <p className="mt-1 text-center text-xs font-bold uppercase tracking-[.25em] text-[#687C93]">
          Controle Operacional
        </p>
        <h2 className="mt-9 text-xl font-bold">Redefinir senha</h2>
        {checking ? (
          <p role="status" className="mt-5 flex items-center gap-2 text-sm text-[#64788F]">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando o link de recuperação…
          </p>
        ) : !hasSession ? (
          <div className="mt-5 space-y-5 text-sm text-[#64788F]">
            <p>Este link de recuperação está inválido ou expirou. Solicite um novo pelo formulário de acesso.</p>
            <a href="/login" className="inline-flex min-h-11 items-center font-semibold text-[#087DC3] hover:underline">
              Voltar ao login
            </a>
          </div>
        ) : (
          <form onSubmit={changePassword} className="mt-5 space-y-5">
            <p className="text-sm text-[#64788F]">Escolha uma nova senha com pelo menos 8 caracteres.</p>
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-semibold">Nova senha</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[#7C90A9]" aria-hidden="true" />
                <input
                  id="new-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={saving}
                  className="h-12 w-full rounded-xl border border-[#D6DFEB] bg-[#F8FAFD] pl-12 pr-12 focus:border-[#058BD6] focus:outline-none focus:ring-4 focus:ring-[#058BD6]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-[#7387A1] focus-visible:outline-2 focus-visible:outline-[#087DC3]"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold">Confirmar nova senha</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={saving}
                className="h-12 w-full rounded-xl border border-[#D6DFEB] bg-[#F8FAFD] px-4 focus:border-[#058BD6] focus:outline-none focus:ring-4 focus:ring-[#058BD6]/10"
              />
            </div>
            {feedback && <p role="alert" className="rounded-lg bg-[#FFF4F4] p-3 text-sm text-[#A23434]">{feedback}</p>}
            <button
              type="submit"
              disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#067DD1] font-bold text-white hover:bg-[#006DB9] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087DC3] disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar nova senha
            </button>
          </form>
        )}
        <p className="mt-8 flex items-center justify-center gap-2 text-xs text-[#8090A5]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Acesso protegido
        </p>
      </section>
    </main>
  );
}
