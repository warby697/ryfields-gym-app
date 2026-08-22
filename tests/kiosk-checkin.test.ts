import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'

const read=(path:string)=>readFileSync(path,'utf8')

describe('door check-in kiosk',()=>{
  it('has a dedicated least-privilege role and screen',()=>{const auth=read('src/features/auth/AuthProvider.tsx'),app=read('src/app/App.tsx');expect(auth).toContain("'kiosk'");expect(app).toContain("role==='kiosk'?<KioskShell/>");expect(app).toContain('className="kiosk-shell"')})
  it('does not download the member directory and requires four typed characters',()=>{const app=read('src/app/App.tsx'),backend=read('functions/src/callable/checkin.ts');expect(app).toContain("'searchCheckInMembers'");expect(app).toContain('text.length<4');expect(app).not.toContain("collection(db,'members')");expect(backend).toContain('min(4)');expect(backend).toContain('.slice(0,10)')})
  it('allows kiosk access only to check-in operations',()=>{const backend=read('functions/src/callable/checkin.ts');expect(backend).toContain("['kiosk','staff','admin']");expect(read('functions/src/callable/shop.ts')).not.toContain("'kiosk'");expect(read('functions/src/callable/members.ts')).not.toContain("'kiosk'")})
})
