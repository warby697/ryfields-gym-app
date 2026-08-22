import { aggregateDailyMetrics,aggregateOperationalReports } from '../../functions/lib/index.js'
export const config={schedule:'10 2 * * *'}
export default async()=>{const event={scheduleTime:new Date().toISOString()};await Promise.all([aggregateDailyMetrics.run(event),aggregateOperationalReports.run(event)]);return new Response(null,{status:204})}
