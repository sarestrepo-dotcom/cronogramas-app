import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CalendarRange, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'reset'

export function LoginPage() {
  const { user, loading, loginGoogle, loginEmail, resetPassword, accesoError } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (!loading && user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await loginEmail(email, password)
      } else {
        await resetPassword(email)
        setSuccessMsg('Revisa tu correo para restablecer tu contraseña.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Correo o contraseña incorrectos.')
      } else if (msg.includes('email-already-in-use')) {
        setError('Ya existe una cuenta con ese correo.')
      } else if (msg.includes('weak-password')) {
        setError('La contraseña debe tener al menos 6 caracteres.')
      } else {
        setError('Ocurrió un error. Intenta de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    try {
      await loginGoogle()
    } catch {
      setError('No se pudo iniciar sesión con Google.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-indigo-600 to-violet-700 p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <CalendarRange size={20} className="text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Cronogramas</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Organiza tus proyectos.<br />Cumple tus plazos.
          </h1>
          <p className="text-indigo-200 text-lg">
            Gestiona cronogramas por empresa, asigna tareas a tu equipo y mantén todo bajo control desde un solo lugar.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {['Triciclo', 'SM', 'MIC', 'Web Solutions'].map((name) => (
              <div key={name} className="bg-white/10 backdrop-blur rounded-xl p-4">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center mb-2">
                  <span className="text-white font-bold text-sm">{name[0]}</span>
                </div>
                <p className="text-white text-sm font-medium">{name}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-indigo-300 text-sm">© 2025 Cronogramas · Todos los derechos reservados</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 justify-center">
            <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center">
              <CalendarRange size={20} className="text-white" />
            </div>
            <span className="text-white font-semibold text-lg">Cronogramas</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">
              {mode === 'login' ? 'Bienvenido de vuelta' : 'Restablecer contraseña'}
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              {mode === 'login' ? 'Acceso restringido — solo usuarios autorizados' : 'Te enviaremos un enlace a tu correo'}
            </p>
          </div>

          {/* Acceso denegado banner */}
          {accesoError && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{accesoError}</span>
            </div>
          )}

          {/* Google button */}
          {mode === 'login' && (
            <button
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 font-medium py-2.5 px-4 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar con Google
            </button>
          )}

          {mode === 'login' && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-slate-500 text-xs">o con correo</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={setEmail}
              icon={<Mail size={16} />}
              placeholder="correo@empresa.com"
            />
            {mode !== 'reset' && (
              <div className="space-y-1">
                <label className="text-sm text-slate-400">Contraseña</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-10 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                <AlertCircle size={16} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm">
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl transition-colors text-sm',
                submitting && 'opacity-50 cursor-not-allowed'
              )}
            >
              {submitting ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : 'Enviar enlace'}
            </button>
          </form>

          {/* Footer links */}
          <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
            {mode === 'login' && (
              <button onClick={() => setMode('reset')} className="hover:text-slate-300 transition-colors">
                ¿Olvidaste tu contraseña?
              </button>
            )}
            {mode === 'reset' && (
              <button onClick={() => setMode('login')} className="text-indigo-400 hover:text-indigo-300 font-medium">
                ← Volver al inicio de sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InputField({
  label, type, value, onChange, icon, placeholder,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  icon: React.ReactNode
  placeholder: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-slate-400">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>
  )
}
