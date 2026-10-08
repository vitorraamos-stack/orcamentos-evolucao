import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import './login-layout.css';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ClipboardList,
  Eye,
  EyeOff,
  Factory,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

type Mode = 'login' | 'recover';

const highlights: { title: string; detail: string; Icon: LucideIcon }[] = [
  { title: 'Orçamentos', detail: 'Mais agilidade no comercial', Icon: ClipboardList },
  { title: 'Produção', detail: 'Acompanhamento de ponta a ponta', Icon: Factory },
  { title: 'Equipe', detail: 'Processos mais organizados', Icon: UsersRound },
  { title: 'Resultados', detail: 'Decisões com mais dados', Icon: BarChart3 },
];

const fieldClass =
  'h-12 w-full rounded-xl border border-[#D6DFEB] bg-[#F8FAFD] pl-12 pr-4 text-base text-[#14253B] placeholder:text-[#93A1B5] transition-colors focus:border-[#058BD6] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#058BD6]/10 disabled:opacity-60';

function BrandPanel() {
  return (
    <section
      aria-label="Sobre o EvoluSystem"
      className="evolu-login__brand relative isolate hidden flex-col justify-between overflow-hidden bg-[#071A34] px-10 text-white lg:flex xl:px-16"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 85% 30%, rgba(10,124,204,.32), transparent 49%), radial-gradient(ellipse at 0% 95%, rgba(3,90,161,.22), transparent 50%), linear-gradient(145deg, #0B2648, #061326 75%)',
        }}
      />
      <svg
        className="pointer-events-none absolute -right-24 top-[8%] -z-10 h-[84%] w-[95%] opacity-60"
        viewBox="0 0 800 1000"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="login-ribbon-blue" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#049DF1" stopOpacity=".08" />
            <stop offset=".6" stopColor="#068FE0" stopOpacity=".65" />
            <stop offset="1" stopColor="#087BC1" stopOpacity=".05" />
          </linearGradient>
          <linearGradient id="login-ribbon-magenta" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#EC008C" stopOpacity=".05" />
            <stop offset=".65" stopColor="#E50088" stopOpacity=".7" />
            <stop offset="1" stopColor="#E50088" stopOpacity=".05" />
          </linearGradient>
          <linearGradient id="login-ribbon-yellow" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#FFF000" stopOpacity=".05" />
            <stop offset=".65" stopColor="#FFDD00" stopOpacity=".75" />
            <stop offset="1" stopColor="#FFDD00" stopOpacity=".05" />
          </linearGradient>
        </defs>
        <path d="M850 5C625 205 739 310 500 445S145 700-50 1040" stroke="url(#login-ribbon-blue)" strokeWidth="96" />
        <path d="M920 5C685 210 795 345 540 510S210 760 30 1060" stroke="url(#login-ribbon-magenta)" strokeWidth="32" />
        <path d="M960 5C720 240 830 370 575 535S270 785 75 1090" stroke="url(#login-ribbon-yellow)" strokeWidth="28" />
        <path d="M650 70L880 245M595 220L855 405M535 365L790 555" stroke="#4E769A" strokeWidth="1" strokeOpacity=".13" />
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 7 }, (_, column) => (
            <circle
              key={row * 7 + column}
              cx={500 + column * 24}
              cy={670 + row * 24}
              r="1.5"
              fill="#1A92D7"
              fillOpacity=".3"
            />
          )),
        )}
      </svg>

      <div className="relative">
        <img
          src="/logo-branca.png"
          alt="Evolução Comunicação Visual"
          className="evolu-login__brand-logo h-auto w-48 object-contain xl:w-56"
        />
      </div>

      <div className="evolu-login__brand-content relative max-w-[660px]">
        <div className="evolu-login__brand-eyebrow flex items-center gap-3 text-xs font-semibold uppercase tracking-[.24em] text-[#AFD2EE]">
          <span className="h-px w-10 bg-[#0BA5EE]" aria-hidden="true" />
          Uma operação conectada
        </div>
        <h1 className="evolu-login__brand-title font-extrabold leading-[.99] tracking-[-.065em]">
          Evolu<span className="text-[#0C9DED]">System</span>
        </h1>
        <p className="evolu-login__brand-subtitle text-sm font-semibold uppercase tracking-[.39em] text-[#D5E6F6] sm:text-base">
          Controle Operacional
        </p>
        <div className="evolu-login__brand-rule flex h-1 w-28 overflow-hidden rounded-full" aria-hidden="true">
          <span className="w-1/3 bg-[#009FE3]" />
          <span className="w-1/3 bg-[#EC008C]" />
          <span className="w-1/3 bg-[#FFE600]" />
        </div>
        <p className="evolu-login__brand-heading max-w-md font-semibold leading-snug tracking-[-.035em]">
          Do atendimento à entrega, tudo em um só lugar.
        </p>
        <p className="evolu-login__brand-description max-w-md leading-relaxed text-[#BDD0E3]">
          Mais organização, agilidade e clareza em cada etapa da sua operação.
        </p>

        <div className="evolu-login__highlights grid grid-cols-2 xl:grid-cols-4">
          {highlights.map(({ title, detail, Icon }) => (
            <div
              key={title}
              className="evolu-login__highlight rounded-2xl border border-white/15 bg-white/[.045] backdrop-blur-sm"
            >
              <Icon className="evolu-login__highlight-icon h-7 w-7 text-[#24AEF4]" strokeWidth={1.8} aria-hidden="true" />
              <h2 className="text-sm font-bold">{title}</h2>
              <p className="evolu-login__highlight-detail text-xs leading-relaxed text-[#C1D1E2]">{detail}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="evolu-login__brand-footer relative text-xs text-[#9CB5CC]">
        © {new Date().getFullYear()} Evolução Comunicação Visual. Todos os direitos reservados.
      </p>
    </section>
  );
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [, setLocation] = useLocation();

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setFeedback('');
    setSent(false);
    setPassword('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setFeedback('');
    try {
      if (mode === 'recover') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + '/redefinir-senha',
        });
        if (error) throw error;
        setSent(true);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast.success('Bem-vindo ao EvoluSystem!');
      setLocation('/');
    } catch (error) {
      if (mode === 'recover') {
        setFeedback('Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
      } else {
        setFeedback('Não foi possível entrar. Confira seu e-mail e sua senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="evolu-login bg-[#F4F7FB] text-[#102038] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
      <BrandPanel />

      <section className="evolu-login__form-side flex flex-col items-center justify-center px-4 sm:px-8 lg:px-10">
        <div className="evolu-login__mobile-brand flex items-center gap-3 lg:hidden">
          <img src="/logo.png" alt="Evolução Comunicação Visual" className="h-14 w-auto" />
          <div className="border-l border-[#D8E0EA] pl-3">
            <p className="text-xl font-extrabold tracking-[-.04em]">Evolu<span className="text-[#008DDD]">System</span></p>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#67788D]">Controle Operacional</p>
          </div>
        </div>

        <div className="evolu-login__card w-full max-w-[540px] rounded-[28px] border border-[#E8EDF4] bg-white shadow-[0_24px_70px_-32px_rgba(23,49,82,.25)]">
          <header className="evolu-login__card-header">
            <p className="text-[11px] font-bold uppercase tracking-[.36em] text-[#72849B]">
              {mode === 'login' ? 'Bem-vindo(a) ao' : 'Recuperação de acesso'}
            </p>
            <div className="evolu-login__card-title mt-2 font-extrabold leading-tight tracking-[-.065em]">
              Evolu<span className="text-[#008DE1]">System</span>
            </div>
            <p className="mt-1 text-xs font-bold uppercase tracking-[.32em] text-[#687C93]">
              Controle Operacional
            </p>
            <p className="evolu-login__card-description text-sm leading-relaxed text-[#6B7B91]">
              {mode === 'login'
                ? 'Entre com suas credenciais para acessar o sistema.'
                : 'Informe seu e-mail para receber instruções de redefinição de senha.'}
            </p>
          </header>

          {sent && mode === 'recover' ? (
            <div className="space-y-6" role="status">
              <div className="rounded-xl border border-[#CFE8DB] bg-[#EFFAF3] p-4 text-sm leading-relaxed text-[#216240]">
                Se houver uma conta vinculada a este e-mail, você receberá as instruções para redefinir sua senha.
              </div>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[#087DC3] hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087DC3]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="evolu-login__form">
              <div>
                <label htmlFor="login-email" className="evolu-login__label block text-sm font-semibold text-[#26374D]">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[#7C90A9]" aria-hidden="true" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setFeedback(''); }}
                    placeholder="seu@email.com"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={loading}
                    className={fieldClass}
                  />
                </div>
              </div>

              {mode === 'login' && (
                <div>
                  <label htmlFor="login-password" className="evolu-login__label block text-sm font-semibold text-[#26374D]">
                    Senha
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[#7C90A9]" aria-hidden="true" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setFeedback(''); }}
                      placeholder="Digite sua senha"
                      autoComplete="current-password"
                      required
                      disabled={loading}
                      className={fieldClass + ' pr-12'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-[#7387A1] hover:bg-[#EAF1F9] hover:text-[#147ABB] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#087DC3]"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <div className="evolu-login__forgot text-right">
                    <button
                      type="button"
                      onClick={() => switchMode('recover')}
                      className="min-h-9 text-sm font-semibold text-[#087DC3] hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087DC3]"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>
                </div>
              )}

              {feedback && (
                <p role="alert" className="rounded-lg border border-[#F5D4D4] bg-[#FFF4F4] px-3 py-2 text-sm text-[#A23434]">
                  {feedback}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-13 w-full items-center justify-center gap-3 rounded-xl bg-[#067DD1] px-4 text-base font-bold text-white shadow-[0_12px_22px_-12px_rgba(0,116,212,.7)] transition-colors hover:bg-[#006DB9] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#087DC3] disabled:cursor-wait disabled:opacity-65"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
                {mode === 'login' ? 'Entrar no sistema' : 'Enviar instruções'}
                {!loading && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
              </button>

              {mode === 'recover' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold text-[#087DC3] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087DC3]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao login
                </button>
              )}
            </form>
          )}

          <div className="evolu-login__card-footer flex items-center justify-between gap-3 border-t border-[#E9EDF4] text-xs text-[#7C8DA3]">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#6E8499]" aria-hidden="true" />
              Acesso protegido
            </span>
            <span>Evolução Comunicação Visual</span>
          </div>
        </div>

        <p className="evolu-login__mobile-copyright text-center text-xs text-[#8A9AAE] lg:hidden">
          © {new Date().getFullYear()} Evolução Comunicação Visual
        </p>
      </section>
    </main>
  );
}
