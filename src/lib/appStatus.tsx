import { useEffect,useState } from 'react'

const dataErrorEvent='ryfields:data-error'
const updateReadyEvent='ryfields:update-ready'

export function reportDataError(area:string,error:unknown){
  console.error(`Live data failed in ${area}:`,error)
  window.dispatchEvent(new CustomEvent(dataErrorEvent,{detail:{area}}))
}

export function announceUpdate(update:()=>Promise<void>){window.dispatchEvent(new CustomEvent(updateReadyEvent,{detail:{update}}))}

export function AppStatusBanners(){
  const[dataAreas,setDataAreas]=useState<string[]>([]),[update,setUpdate]=useState<null|(()=>Promise<void>)>(null)
  useEffect(()=>{
    const failed=(event:Event)=>{const area=String((event as CustomEvent).detail?.area||'live information');setDataAreas(current=>current.includes(area)?current:[...current,area])}
    const ready=(event:Event)=>setUpdate(()=>(event as CustomEvent).detail.update)
    window.addEventListener(dataErrorEvent,failed);window.addEventListener(updateReadyEvent,ready)
    return()=>{window.removeEventListener(dataErrorEvent,failed);window.removeEventListener(updateReadyEvent,ready)}
  },[])
  return <>{update&&<aside className="app-status update-ready" role="status"><strong>A newer version of the app is ready.</strong><button onClick={()=>void update()}>Update now</button></aside>}{dataAreas.length>0&&<aside className="app-status data-warning" role="alert"><span><strong>Some live information couldn’t be loaded.</strong> This is not the same as there being nothing there. Please refresh and try again.</span><button onClick={()=>window.location.reload()}>Refresh</button></aside>}</>
}
