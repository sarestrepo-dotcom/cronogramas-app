import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '@/lib/firebase'
import { getPermiso, contarPermitidos, crearPermiso } from '@/lib/firestore'
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
        await syncUsuario(u)

        const email = u.email ?? ''
        let p = await getPermiso(email)

        if (!p) {
          // Bootstrap: if whitelist is completely empty, first login becomes admin
          const total = await contarPermitidos()
          if (total === 0) {
            await crearPermiso({
              email,
              nombre: u.displayName ?? email,
              rol: 'admin',
              activo: true,
              empresas: [],
              agregadoPor: 'bootstrap',
            })
            p = await getPermiso(email)
          }
        }

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
    await updateProfile(user, { displayName: nombre })
    await syncUsuario(user)
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
