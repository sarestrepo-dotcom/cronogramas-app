import { useState, useEffect } from 'react'
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { useEmpresas } from '@/hooks/useEmpresas'
import { getInitials } from '@/lib/utils'
import { getEmailConfig, guardarEmailConfig, enviarEmailAhora as callEnviarEmail, previewEmailSemanal } from '@/lib/firestore'
import { suscribirProyectosPorEmpresa } from '@/lib/firestore'
import { User, Lock, Bell, Shield, CheckCircle2, Mail, Plus, Trash2, Send, Eye, EyeOff, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailConfig, Proyecto } from '@/types'

type Section = 'perfil' | 'seguridad' | 'email'

export function SettingsPage() {
  const [section, setSection] = useState<Section>('perfil')
  const { isAdmin } = useAuth()

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Configuración</h1>

      <div className="flex gap-6">
        {/* Sidebar de secciones */}
        <nav className="w-44 flex-shrink-0 space-y-1">
          <SectionBtn icon={<User size={15} />} label="Perfil" active={section === 'perfil'} onClick={() => setSection('perfil')} />
          <SectionBtn icon={<Lock size={15} />} label="Seguridad" active={section === 'seguridad'} onClick={() => setSection('seguridad')} />
          {isAdmin && (
            <SectionBtn icon={<Mail size={15} />} label="Email semanal" active={section === 'email'} onClick={() => setSection('email')} />
          )}
        </nav>

        {/* Contenido */}
        <div className="flex-1">
          {section === 'perfil' && <PerfilSection />}
          {section === 'seguridad' && <SeguridadSection />}
          {section === 'email' && isAdmin && <EmailSection />}
        </div>
      </div>
    </div>
  )
}

// ─── Email semanal ────────────────────────────────────────────────────────────

function EmailSection() {
  const { user } = useAuth()
  const { empresas } = useEmpresas()

  const [config, setConfig] = useState<Omit<EmailConfig, 'uid'>>({
    gmailUser: '', gmailAppPassword: '', groqApiKey: '', habilitado: false,
    responsables: [], proyectosIds: [],
  })
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [showPass, setShowPass] = useState(false)
  const [newNombre, setNewNombre] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sentMsg, setSentMsg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previews, setPreviews] = useState<Array<{nombre: string; email: string; body: string}>>([])
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (!user) return
    getEmailConfig(user.uid).then(c => {
      if (c) setConfig({
        gmailUser: c.gmailUser, gmailAppPassword: c.gmailAppPassword,
        groqApiKey: c.groqApiKey ?? '',
        habilitado: c.habilitado, responsables: c.responsables, proyectosIds: c.proyectosIds,
      })
      setLoading(false)
    })
  }, [user?.uid])

  // Load all projects from all companies
  useEffect(() => {
    if (!user || empresas.length === 0) return
    const unsubs: (() => void)[] = []
    const all: Proyecto[] = []
    let loaded = 0
    for (const e of empresas) {
      const u = suscribirProyectosPorEmpresa(e.id, user.uid, (ps) => {
        // merge
        ps.forEach(p => { if (!all.find(x => x.id === p.id)) all.push(p) })
        loaded++
        if (loaded === empresas.length) setProyectos([...all])
      })
      unsubs.push(u)
    }
    return () => unsubs.forEach(u => u())
  }, [user?.uid, empresas.map(e => e.id).join(',')])

  const addResponsable = () => {
    if (!newNombre.trim() || !newEmail.trim()) return
    setConfig(c => ({ ...c, responsables: [...c.responsables, { nombre: newNombre.trim(), email: newEmail.trim() }] }))
    setNewNombre(''); setNewEmail('')
  }
  const removeResponsable = (i: number) =>
    setConfig(c => ({ ...c, responsables: c.responsables.filter((_, idx) => idx !== i) }))
  const toggleProyecto = (id: string) =>
    setConfig(c => ({
      ...c,
      proyectosIds: c.proyectosIds.includes(id)
        ? c.proyectosIds.filter(p => p !== id)
        : [...c.proyectosIds, id],
    }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true); setError('')
    try {
      await guardarEmailConfig(user.uid, config)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { setError('Error al guardar.') }
    finally { setSaving(false) }
  }

  const handleVistaPrevia = async () => {
    setLoadingPreview(true); setError('')
    try {
      const result = await previewEmailSemanal()
      if (result.length === 0) {
        setError('No hay tareas asignadas para los responsables configurados en las fechas actuales.')
        return
      }
      setPreviews(result)
      setShowPreview(true)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Error desconocido'
      setError(`Error al generar vista previa: ${msg}`)
    } finally { setLoadingPreview(false) }
  }

  const handleEnviarConCuerpos = async () => {
    setSending(true); setError('')
    try {
      await callEnviarEmail(previews)
      setSentMsg('¡Emails enviados correctamente!')
      setShowPreview(false)
      setTimeout(() => setSentMsg(''), 5000)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Error desconocido'
      setError(`Error al enviar: ${msg}`)
    } finally { setSending(false) }
  }

  const handleEnviarAhora = async () => {
    setSending(true); setSentMsg(''); setError('')
    try {
      await callEnviarEmail()
      setSentMsg('¡Emails enviados correctamente!')
      setTimeout(() => setSentMsg(''), 5000)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Error desconocido'
      setError(`Error al enviar: ${msg}`)
    } finally { setSending(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-800">⚙️ Configuración requerida (una sola vez)</p>
        <ol className="text-xs text-amber-700 space-y-1 list-decimal list-inside">
          <li>Ve a <strong>myaccount.google.com → Seguridad → Verificación en 2 pasos</strong> y actívala</li>
          <li>Luego ve a <strong>Seguridad → Contraseñas de aplicación</strong></li>
          <li>Crea una para "Correo" y copia la clave de 16 caracteres</li>
          <li>Pega esa clave en el campo <strong>"App Password"</strong> abajo</li>
          <li>Los emails se enviarán automáticamente cada lunes a las 8am</li>
        </ol>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Mail size={16} className="text-indigo-500" /> Email semanal automático
          </h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-slate-600">{config.habilitado ? 'Activo' : 'Inactivo'}</span>
            <button type="button" onClick={() => setConfig(c => ({ ...c, habilitado: !c.habilitado }))}
              className={cn('relative w-10 h-5 rounded-full transition-colors', config.habilitado ? 'bg-indigo-600' : 'bg-slate-300')}>
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                config.habilitado ? 'left-5' : 'left-0.5')} />
            </button>
          </label>
        </div>

        {/* Gmail credentials */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Gmail del remitente</label>
            <input className="input-base" type="email" value={config.gmailUser}
              onChange={e => setConfig(c => ({ ...c, gmailUser: e.target.value }))}
              placeholder="tu@gmail.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">App Password (16 caracteres)</label>
            <div className="relative">
              <input className="input-base pr-10" type={showPass ? 'text' : 'password'}
                value={config.gmailAppPassword}
                onChange={e => setConfig(c => ({ ...c, gmailAppPassword: e.target.value }))}
                placeholder="xxxx xxxx xxxx xxxx" />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Groq API Key */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Clave API de Groq
            <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Gratuita</span>
          </label>
          <input className="input-base font-mono" type="password"
            value={config.groqApiKey ?? ''}
            onChange={e => setConfig(c => ({ ...c, groqApiKey: e.target.value }))}
            placeholder="gsk_..." />
          <p className="text-xs text-slate-400">
            Necesaria para <strong>Procesar respuestas de email con IA</strong> (gratis, sin límite práctico).{' '}
            Obtenla en{' '}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
              className="text-indigo-600 hover:underline">console.groq.com/keys</a>
            {' '}→ Create API Key.
          </p>
        </div>

        {/* Responsables */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-700">Responsables y sus emails</label>
          <p className="text-xs text-slate-400">El sistema busca coincidencias entre el nombre y el campo "Responsable" de cada tarea.</p>
          <div className="space-y-2">
            {config.responsables.map((r, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                <span className="text-sm font-medium text-slate-700 w-32 truncate">{r.nombre}</span>
                <span className="text-xs text-slate-400 flex-1 truncate">{r.email}</span>
                <button type="button" onClick={() => removeResponsable(i)}
                  className="text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input-base flex-1" value={newNombre} onChange={e => setNewNombre(e.target.value)}
              placeholder="Nombre (ej: Checho)" />
            <input className="input-base flex-1" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="email@empresa.com"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addResponsable() } }} />
            <button type="button" onClick={addResponsable}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-xl transition-colors">
              <Plus size={14} /> Agregar
            </button>
          </div>
        </div>

        {/* Proyectos */}
        {proyectos.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Proyectos a incluir</label>
            <div className="grid grid-cols-2 gap-2">
              {proyectos.map(p => (
                <label key={p.id} className={cn(
                  'flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm',
                  config.proyectosIds.includes(p.id) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-slate-300'
                )}>
                  <input type="checkbox" className="accent-indigo-600"
                    checked={config.proyectosIds.includes(p.id)}
                    onChange={() => toggleProyecto(p.id)} />
                  <span className="truncate">{p.nombre}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        {sentMsg && <p className="text-sm text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2">✓ {sentMsg}</p>}

        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 flex-wrap">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && <span className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={14} /> Guardado</span>}
          <div className="flex-1" />
          <button type="button" onClick={handleVistaPrevia}
            disabled={loadingPreview || !config.gmailUser || !config.gmailAppPassword || config.responsables.length === 0}
            className="flex items-center gap-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
            {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {loadingPreview ? 'Generando...' : 'Vista previa y editar'}
          </button>
          <button type="button" onClick={handleEnviarAhora} disabled={sending || !config.gmailUser || !config.gmailAppPassword}
            className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
            <Send size={14} />
            {sending ? 'Enviando...' : 'Enviar directo'}
          </button>
        </div>
      </form>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Send size={16} className="text-indigo-500" /> Vista previa de emails
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {previews.length} destinatario{previews.length !== 1 ? 's' : ''} · Puedes editar el contenido antes de enviar
                </p>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {previews.map((preview, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {preview.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{preview.nombre}</span>
                    <span className="text-xs text-slate-400">{preview.email}</span>
                  </div>
                  <textarea
                    className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono text-slate-700 resize-none focus:outline-none focus:border-indigo-400"
                    value={preview.body}
                    onChange={(e) => {
                      const updated = [...previews]
                      updated[i] = { ...preview, body: e.target.value }
                      setPreviews(updated)
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex-shrink-0">
              <button onClick={() => setShowPreview(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleEnviarConCuerpos} disabled={sending}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Enviando...' : `Enviar ${previews.length} email${previews.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
        active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      )}
    >
      {icon} {label}
    </button>
  )
}

// ─── Perfil ───────────────────────────────────────────────────────────────────

function PerfilSection() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateProfile(auth.currentUser!, { displayName: displayName.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('No se pudo actualizar el nombre.')
    } finally {
      setSaving(false)
    }
  }

  const initials = getInitials(user?.displayName ?? user?.email ?? 'U')
  const isGoogle = user?.providerData?.some((p) => p.providerId === 'google.com')

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
        <User size={16} className="text-indigo-500" /> Perfil
      </h2>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" className="w-16 h-16 rounded-full border-2 border-white shadow-md" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-xl font-bold text-white shadow-md">
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-slate-900">{user?.displayName ?? 'Sin nombre'}</p>
          <p className="text-xs text-slate-500">{user?.email}</p>
          {isGoogle && (
            <span className="inline-flex items-center gap-1 mt-1 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              <Shield size={10} /> Cuenta Google
            </span>
          )}
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Nombre para mostrar</label>
          <input
            className="input-base"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Tu nombre completo"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Correo electrónico</label>
          <input className="input-base bg-slate-50 text-slate-400 cursor-not-allowed" value={user?.email ?? ''} disabled />
          <p className="text-xs text-slate-400">El correo no se puede cambiar desde aquí.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Guardado
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

// ─── Seguridad ────────────────────────────────────────────────────────────────

function SeguridadSection() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const isGoogle = user?.providerData?.some((p) => p.providerId === 'google.com')
  const isEmailProvider = user?.providerData?.some((p) => p.providerId === 'password')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return }
    if (newPassword.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres.'); return }
    setSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user!.email!, currentPassword)
      await reauthenticateWithCredential(auth.currentUser!, credential)
      await updatePassword(auth.currentUser!, newPassword)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Contraseña actual incorrecta.')
      } else {
        setError('No se pudo cambiar la contraseña. Intenta de nuevo.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
        <Lock size={16} className="text-indigo-500" /> Seguridad
      </h2>

      {isGoogle && !isEmailProvider ? (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-700 flex items-start gap-3">
          <Bell size={16} className="flex-shrink-0 mt-0.5" />
          <p>Tu cuenta usa Google como proveedor de autenticación. Gestiona tu contraseña directamente desde tu cuenta de Google.</p>
        </div>
      ) : (
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Contraseña actual</label>
            <input className="input-base" type="password" value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nueva contraseña</label>
            <input className="input-base" type="password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Confirmar nueva contraseña</label>
            <input className="input-base" type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Repite la contraseña" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 size={15} /> Contraseña actualizada
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
