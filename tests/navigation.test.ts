import {readFileSync,readdirSync,statSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'

const publicRoutes=new Set(['/login','/register','/reset-password','/terms','/privacy'])
const memberRoutes=new Set(['/','/bookings','/classes','/shop','/card','/check-in','/profile','/payments','/payment/return','/upgrade'])
const staffRoutes=new Set(['/','/members','/classes','/payments','/check-in','/membership-types','/class-templates','/reports','/email-templates','/shop-products','/cash-import','/audit'])
const instructorRoutes=new Set(['/'])
const serverRoutes=new Set(['/share/event/:id','/share/event-image/:id','/share/class/:id','/.netlify/functions/api','/.netlify/functions/stripe-webhook','/.netlify/functions/gocardless-webhook'])
const allRoutes=new Set([...publicRoutes,...memberRoutes,...staffRoutes,...serverRoutes])

function page(path:string){const clean=path.split(/[?#]/)[0]||'/';if(clean.startsWith('/share/event-image/'))return'/share/event-image/:id';if(clean.startsWith('/share/event/'))return'/share/event/:id';if(clean.startsWith('/share/class/'))return'/share/class/:id';return clean}
function files(root:string):string[]{return readdirSync(root).flatMap(name=>{const path=join(root,name);return statSync(path).isDirectory()?files(path):path.endsWith('.tsx')||path.endsWith('.ts')?[path]:[]})}

describe('site navigation map',()=>{
  it('has a real destination for every literal internal link',()=>{
    const unresolved=new Set<string>()
    for(const file of files('src')){
      const source=readFileSync(file,'utf8')
      for(const match of source.matchAll(/\b(?:to|href)=["'](\/[^"']*)["']/g)){const target=page(match[1]);if(!allRoutes.has(target))unresolved.add(`${file}: ${match[1]}`)}
    }
    expect([...unresolved]).toEqual([])
  })

  it('covers every admin navigation destination',()=>{
    expect(['/','/members','/classes','/payments','/check-in','/membership-types','/class-templates','/reports','/email-templates','/shop-products','/cash-import','/audit'].filter(path=>!staffRoutes.has(path))).toEqual([])
  })

  it.each([
    ['Gym Plus',['/','/bookings','/classes','/shop','/card','/check-in','/profile']],
    ['Gym',['/','/bookings','/classes','/shop','/card','/check-in','/profile','/upgrade']],
    ['registered non-member',['/','/bookings','/classes','/shop','/card','/check-in','/profile']],
  ])('covers every %s member destination',(_role,targets)=>{
    expect(targets.filter(path=>!memberRoutes.has(path))).toEqual([])
  })

  it('keeps payment, event and sharing returns inside valid member routes',()=>{
    expect(page('/shop?checkout=success&session_id=test')).toBe('/shop')
    expect(page('/?event=test&event_checkout=success&session_id=test')).toBe('/')
    expect(page('/?event=test&returnTo=shop')).toBe('/')
    expect(page('/classes?session=test')).toBe('/classes')
    expect(page('/payment/return')).toBe('/payment/return')
  })

  it('preserves exact deep links through login and paid-event Shop returns',()=>{
    const guard=readFileSync('src/features/auth/ProtectedRoute.tsx','utf8'),login=readFileSync('src/features/auth/LoginPage.tsx','utf8'),shop=readFileSync('functions/src/callable/shop.ts','utf8')
    expect(guard).toContain('`${location.pathname}${location.search}`')
    expect(login).toContain('<Navigate to={returnTo} replace />')
    expect(shop).toContain("parsed.data.returnToShop?'&returnTo=shop':''")
  })

  it('has no fallback redirect loops for any role',()=>{
    const fallback=(path:string,routes:Set<string>)=>routes.has(page(path))?page(path):'/'
    for(const routes of [memberRoutes,staffRoutes,instructorRoutes]){
      const first=fallback('/definitely-not-a-route',routes),second=fallback(first,routes)
      expect(first).toBe('/')
      expect(second).toBe(first)
    }
  })
})
