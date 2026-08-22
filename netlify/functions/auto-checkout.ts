import { autoCheckoutVisits } from '../../functions/lib/index.js'
export const config={schedule:'*/5 * * * *'}
export default async()=>{await autoCheckoutVisits.run({scheduleTime:new Date().toISOString()});return new Response(null,{status:204})}
