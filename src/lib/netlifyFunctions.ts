import { auth } from './firebase'

type CallableResult<T>={data:T}

export function httpsCallable<Input=unknown,Output=unknown>(_unused:unknown,name:string){
  return async(input:Input):Promise<CallableResult<Output>>=>{
    const user=auth.currentUser
    if(!user)throw new Error('Sign-in is required.')
    const token=await user.getIdToken()
    const response=await fetch('/.netlify/functions/api',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({name,data:input}),
    })
    const payload=await response.json().catch(()=>({error:'The server returned an invalid response.'})) as {data?:Output;error?:string}
    if(!response.ok)throw new Error(payload.error||'The request could not be completed.')
    return{data:payload.data as Output}
  }
}
