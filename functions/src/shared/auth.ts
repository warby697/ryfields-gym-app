import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export type StaffRole = 'staff' | 'admin'

export function requireStaff(request: CallableRequest): StaffRole {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in is required.')
  const role = request.auth.token.role
  if (role !== 'staff' && role !== 'admin') throw new HttpsError('permission-denied', 'Staff access is required.')
  return role
}

export function requireAdmin(request: CallableRequest): 'admin' {
  requireStaff(request)
  if (request.auth!.token.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access is required.')
  return 'admin'
}

export function requireClassStaff(request: CallableRequest): 'instructor'|'staff'|'admin' {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in is required.')
  const role=request.auth.token.role
  if(!['instructor','staff','admin'].includes(String(role)))throw new HttpsError('permission-denied','Instructor or staff access is required.')
  return role as 'instructor'|'staff'|'admin'
}
