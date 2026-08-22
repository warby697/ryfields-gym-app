import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import { AuthProvider } from './features/auth/AuthProvider'
import { announceUpdate } from './lib/appStatus'
import './styles.css'

if(import.meta.env.DEV){
  // A previously installed production PWA can otherwise keep serving stale
  // screens on localhost while we are actively developing the app.
  void navigator.serviceWorker?.getRegistrations().then(items=>Promise.all(items.map(item=>item.unregister())))
  void caches?.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key))))
}else{
  const updateSW=registerSW({immediate:true,onNeedRefresh:()=>announceUpdate(()=>updateSW(true)),onRegisteredSW:(_url,registration)=>window.setInterval(()=>void registration?.update(),60*60_000)})
}
createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>,
)
