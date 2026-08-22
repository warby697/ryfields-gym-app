import { BarChart3,Download,TrendingUp,Users } from 'lucide-react'
import { collection,doc,limit,onSnapshot,orderBy,query } from 'firebase/firestore'
import { useEffect,useState } from 'react'
import { db,firebaseConfigured } from '../../lib/firebase'

type Metric={date:string;activeMembers:number;newMembers:number;cancellations:number;incomeMinor:number;failedPayments:number;visits:number;classAttendance:number;classesHeld:number}
type Snapshot={popularClasses:{name:string;bookings:number;capacity:number;sessions:number;utilisation:number}[];visitFrequency:{frequent:number;regular:number;occasional:number;none:number}}
const demo:Metric[]=[{date:'2026-07-08',activeMembers:412,newMembers:2,cancellations:0,incomeMinor:92000,failedPayments:1,visits:78,classAttendance:46,classesHeld:5},{date:'2026-07-09',activeMembers:415,newMembers:3,cancellations:0,incomeMinor:128000,failedPayments:0,visits:91,classAttendance:52,classesHeld:6},{date:'2026-07-10',activeMembers:418,newMembers:3,cancellations:1,incomeMinor:73500,failedPayments:2,visits:85,classAttendance:58,classesHeld:6},{date:'2026-07-11',activeMembers:421,newMembers:4,cancellations:1,incomeMinor:110000,failedPayments:1,visits:102,classAttendance:64,classesHeld:7},{date:'2026-07-12',activeMembers:423,newMembers:2,cancellations:0,incomeMinor:84000,failedPayments:0,visits:67,classAttendance:42,classesHeld:4},{date:'2026-07-13',activeMembers:426,newMembers:3,cancellations:0,incomeMinor:99000,failedPayments:2,visits:96,classAttendance:60,classesHeld:6},{date:'2026-07-14',activeMembers:428,newMembers:2,cancellations:0,incomeMinor:121500,visits:109,failedPayments:1,classAttendance:68,classesHeld:7}]
const demoSnapshot:Snapshot={popularClasses:[{name:'BoxFit',bookings:184,capacity:200,sessions:10,utilisation:92},{name:'Yoga Flow',bookings:142,capacity:160,sessions:10,utilisation:89},{name:'Strength Circuit',bookings:130,capacity:160,sessions:8,utilisation:81}],visitFrequency:{frequent:96,regular:174,occasional:118,none:40}}

export function ReportsPage(){
  // On the live site these collections may be empty until the scheduled jobs run —
  // start blank there (never show demo numbers as if real), and guard every read.
  const [metrics,setMetrics]=useState<Metric[]>(firebaseConfigured?[]:demo)
  const [snapshot,setSnapshot]=useState<Snapshot|null>(firebaseConfigured?null:demoSnapshot)
  const [members,setMembers]=useState<{membershipStatus?:string;cancellationAcknowledged?:boolean}[]>([])
  useEffect(()=>{
    if(!firebaseConfigured)return
    const stopMetrics=onSnapshot(query(collection(db,'dailyMetrics'),orderBy('date','desc'),limit(30)),result=>setMetrics(result.docs.map(item=>item.data() as Metric).reverse()))
    const stopSnapshot=onSnapshot(doc(db,'reportSnapshots','current'),result=>{if(result.exists())setSnapshot(result.data() as Snapshot)})
    // Live member counts so the headline matches the Dashboard (not the overnight snapshot).
    const stopMembers=onSnapshot(collection(db,'members'),result=>setMembers(result.docs.map(item=>item.data() as {membershipStatus?:string})))
    return()=>{stopMetrics();stopSnapshot();stopMembers()}
  },[])
  const latest=metrics.at(-1)
  // Active = active + payment_failed (a failed payment is still a member, retrying) — same rule as the Dashboard.
  const liveActive=members.filter(m=>['active','payment_failed'].includes(String(m.membershipStatus))).length
  const activeMembers=firebaseConfigured?liveActive:(latest?.activeMembers??0)
  const registered=members.length
  const maxVisits=Math.max(1,...metrics.map(item=>item.visits))
  const visitScale=Math.max(10,Math.ceil(maxVisits/10)*10)
  const visitTicks=[visitScale,Math.round(visitScale*.75),Math.round(visitScale*.5),Math.round(visitScale*.25),0]
  function exportCsv(){
    if(!latest)return
    const headings=Object.keys(latest) as (keyof Metric)[]
    const body=[headings.join(','),...metrics.map(item=>headings.map(key=>item[key]).join(','))].join('\n')
    const url=URL.createObjectURL(new Blob([body],{type:'text/csv'})),link=document.createElement('a')
    link.href=url;link.download='ryfields-report.csv';link.click();URL.revokeObjectURL(url)
  }
  return <>
    <header className="page-head"><div><p className="eyebrow">Performance</p><h1>Reports</h1><p>Membership, income and attendance trends.</p></div><button className="secondary" onClick={exportCsv} disabled={!latest}><Download/> Export CSV</button></header>
    <section className="report-summary">
      <article className="panel"><Users/><span>Active members</span><strong>{activeMembers}</strong><small>Active + retrying{registered?` · ${registered} registered`:''}</small></article>
      <article className="panel"><TrendingUp/><span>Latest daily income</span><strong>{latest?`£${(latest.incomeMinor/100).toFixed(0)}`:'—'}</strong></article>
      <article className="panel"><BarChart3/><span>Latest visits</span><strong>{latest?latest.visits:'—'}</strong></article>
    </section>
    {latest&&<>
      <section className="report-grid">
        <article className="panel chart-card"><p className="eyebrow">Visit frequency</p><h2>Daily gym visits</h2><div className="bar-chart-wrap"><div className="bar-y-axis" aria-hidden="true">{visitTicks.map(value=><small key={value}>{value}</small>)}</div><div className="bar-chart">{metrics.map(item=><div key={item.date}><span style={{height:`${item.visits/visitScale*100}%`}} title={`${item.visits} visits`}/><small>{item.date.slice(8)}</small></div>)}</div></div></article>
        <article className="panel"><p className="eyebrow">Member habits · 30 days</p><h2>Visit frequency</h2>{snapshot?<dl className="report-list"><div><dt>Frequent (8+)</dt><dd>{snapshot.visitFrequency.frequent}</dd></div><div><dt>Regular (4–7)</dt><dd>{snapshot.visitFrequency.regular}</dd></div><div><dt>Occasional (1–3)</dt><dd>{snapshot.visitFrequency.occasional}</dd></div><div><dt>No visits</dt><dd>{snapshot.visitFrequency.none}</dd></div></dl>:<p className="no-results">Habit data appears once the daily report job has run.</p>}</article>
      </section>
      {snapshot&&<article className="panel popular-report"><p className="eyebrow">Class demand · 30 days</p><h2>Popular classes</h2>{snapshot.popularClasses.map(item=><div className="popular-row" key={item.name}><strong>{item.name}</strong><div><i style={{width:`${item.utilisation}%`}}/></div><span>{item.bookings} bookings</span><em>{item.utilisation}% full</em></div>)}</article>}
    </>}
    {!latest&&<article className="panel empty"><h2>No daily trends to show yet</h2><p>Income and visit charts will appear after the overnight report has activity to summarise.</p></article>}
  </>
}
