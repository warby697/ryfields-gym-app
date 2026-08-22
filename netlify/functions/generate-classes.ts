import { generateClassSessions } from '../../functions/lib/index.js'
export const config={schedule:'15 1 * * *'}
export default async()=>{await generateClassSessions.run({scheduleTime:new Date().toISOString()});return new Response(null,{status:204})}
