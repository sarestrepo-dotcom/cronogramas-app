import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase'
import { getPermiso } from '@/lib/firestore'
import type { UsuarioPermitido } from '@/types'

interface AuthContextValue {
  user: User | null
  permiso: UsuarioPermitido | null
  isAdmin: boolean
  loading: boolean
  accesoError: string | null
  loginGoogle: () => Promise<void>
  loginEmail: (email: string, password: string) => Promise<void>
  registerEmail: (email: string, password: string, nombre: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function syncUsuario(user: User) {
  const ref = doc(db, 'usuarios', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? user.email,
      photoURL: user.photoURL ?? null,
      empresas: [],
      creadoEn: serverTimestamp(),
    })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]     = useState<User | null>(null)
  const [permiso, setPermiso] = useState<UsuarioPermitido | null>(null)
  const [loading, setLoading] = useState(true)
  const [accesoError, setAccesoError] = useState<string | null>(null)

  // Prevents re-running the whitelist check when WE trigger a signOut
  const rechazandoRef = useRef(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      // If we triggered this signOut ourselves (access denied), skip
      if (rechazandoRef.current) {
        rechazandoRef.current = false
        setLoading(false)
        return
      }

      if (u) {
        setLoading(true)

        // Las reglas de Firestore exigen email verificado: sin esto, alguien podría
        // registrarse con email/password usando el correo de un usuario permitido.
        if (!u.emailVerified) {
          try { await sendEmailVerification(u) } catch { /* ya enviado recientemente */ }
          rechazandoRef.current = true
          setAccesoError(`Te enviamos un correo de verificación a ${u.email}. Ábrelo, confirma tu cuenta y vuelve a iniciar sesión.`)
          setUser(null)
          setPermiso(null)
          await signOut(auth)
          setLoading(false)
          return
        }

        const email = u.email ?? ''
        const p = await getPermiso(email).catch(() => null)

        if (!p) {
          rechazandoRef.current = true
          setAccesoError('Tu cuenta no tiene acceso a esta aplicación. Contacta al administrador.')
          setUser(null)
          setPermiso(null)
          await signOut(auth)
          setLoading(false)
          return
        }

        if (!p.activo) {
          rechazandoRef.current = true
          setAccesoError('Tu cuenta ha sido desactivada. Contacta al administrador.')
          setUser(null)
          setPermiso(null)
          await signOut(auth)
          setLoading(false)
          return
        }

        await syncUsuario(u)
        setAccesoError(null)
        setUser(u)
        setPermiso(p)
      } else {
        setUser(null)
        setPermiso(null)
      }

      setLoading(false)
    })
  }, [])

  const loginGoogle = async () => {
    setAccesoError(null)
    await signInWithPopup(auth, googleProvider)
  }

  const loginEmail = async (email: string, password: string) => {
    setAccesoError(null)
    await signInWithEmailAndPassword(auth, email, password)
  }

  const registerEmail = async (email: string, password: string, nombre: string) => {
    setAccesoError(null)
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    // El correo de verificación lo envía onAuthStateChanged; el perfil se
    // sincroniza en el primer login ya verificado.
    await updateProfile(user, { displayName: nombre }).catch(() => {})
  }

  const logout = async () => {
    setAccesoError(null)
    await signOut(auth)
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const isAdmin = permiso?.rol === 'admin'

  return (
    <AuthContext.Provider value={{
      user, permiso, isAdmin, loading, accesoError,
      loginGoogle, loginEmail, registerEmail, logout, resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
