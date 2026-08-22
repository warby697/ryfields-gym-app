import { cert,getApps,initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if(!getApps().length){const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID,clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');initializeApp(projectId&&clientEmail&&privateKey?{credential:cert({projectId,clientEmail,privateKey})}:undefined)}

export default async(req:Request)=>{const id=new URL(req.url).searchParams.get('id')||'';if(!id)return new Response('Not found',{status:404});const event=await getFirestore().collection('events').doc(id).get(),data=String(event.get('imageDataUrl')||''),match=data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!event.exists||!match)return new Response('Not found',{status:404});return new Response(Buffer.from(match[2],'base64'),{headers:{'Content-Type':match[1],'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}})}
