import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth, firebaseConfigured } from '../../lib/firebase'
import { httpsCallable } from '../../lib/netlifyFunctions'

type Role = 'member' | 'instructor' | 'staff' | 'admin' | 'kiosk'
type Session = { user: User | null; role: Role | null; memberId: string | null; loading: boolean; demo: boolean }
type AuthContextValue = Session & {
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ user: null, role: firebaseConfigured ? null : 'admin', memberId:null, loading: firebaseConfigured, demo: !firebaseConfigured })

  useEffect(() => {
    if (!firebaseConfigured) return
    return onIdTokenChanged(auth, async user => {
      let token = user ? await user.getIdTokenResult() : null
      if(user&&!token?.claims.role){try{await httpsCallable<Record<string,never>,{ok:boolean}>(null,'bootstrapAdmin')({});await user.getIdToken(true);token=await user.getIdTokenResult()}catch{/* Not the configured first administrator. */}}
      const claimedRole = token?.claims.role
      const role = ['member', 'instructor', 'staff', 'admin', 'kiosk'].includes(String(claimedRole)) ? claimedRole as Role : null
      setSession({ user, role, memberId:typeof token?.claims.memberId==='string'?token.claims.memberId:null, loading: false, demo: false })
    })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    ...session,
    login: async (email, password) => { await signInWithEmailAndPassword(auth, email, password) },
    logout: async () => { if (firebaseConfigured) await signOut(auth) },
  }), [session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
