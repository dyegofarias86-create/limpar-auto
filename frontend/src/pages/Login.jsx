import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const result = await login(form.email, form.password);
    if (result.success) navigate('/');
    else setError(result.error);
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0D4F5C 0%, #00AEEF 100%)' }}>
      {/* Left panel — logo, texto, mascote */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12">
        <div className="text-white max-w-md flex flex-col items-center text-center">

          {/* Logo */}
          <div className="mb-6">
            <img
              src="/logo-limpar.png"
              alt="LimpAr Auto"
              className="h-20 object-contain mx-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>

          {/* Textos */}
          <h2 className="text-3xl font-bold mb-3">Sistema de Gestão Comercial</h2>
          <p className="text-primary-100 text-lg leading-relaxed mb-8">
            Acompanhe gastos, provisões, faturamento e agenda da sua equipe em um só lugar.
          </p>

          {/* Mascote */}
          <img
            src="/mascote.png"
            alt="Mascote LimpAr"
            className="w-72 object-contain drop-shadow-2xl"
            style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.3))' }}
          />
        </div>
      </div>

      {/* Right panel — formulário */}
      <div className="flex-1 lg:max-w-md flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="mb-6 lg:hidden">
            <img src="/logo-limpar.png" alt="LimpAr Auto" className="h-12 object-contain" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Bem-vindo de volta</h2>
          <p className="text-gray-500 mb-8">Entre com suas credenciais para acessar</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                className="input"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(v => ({ ...v, password: e.target.value }))}
                  required
                />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">
              {loading ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
