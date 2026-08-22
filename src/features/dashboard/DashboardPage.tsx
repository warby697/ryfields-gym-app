import { collection,limit,onSnapshot,orderBy,query,where } from 'firebase/firestore'
import { Package } from 'lucide-react'
import { useEffect,useMemo,useState } from 'react'
import { NavLink } from 'react-router-dom'
import { db,firebaseConfigured,functions } from '../../lib/firebase'
import { httpsCallable } from '../../lib/netlifyFunctions'
import { useAuth } from '../auth/AuthProvider'

const FACES=['😞','🙁','😐','🙂','😄']
type Feedback={id:string;memberName:string;rating:number;comment?:string;prompt?:string;visitAt?:{toDate():Date}|null;updatedAt?:{toDate():Date}|null}
type CheckInFailure={id:string;reason?:string;memberName?:string|null;memberNumber?:string|null;method?:string;at?:{toDate():Date}}
function CheckInProblemsPanel(){
  const[items,setItems]=useState<CheckInFailure[]>([])
  useEffect(()=>{if(!firebaseConfigured)return;return onSnapshot(query(collection(db,'checkInFailures'),orderBy('at','desc'),limit(10)),snapshot=>setItems(snapshot.docs.map(item=>({id:item.id,...item.data()}) as CheckInFailure)),()=>setItems([]))},[])
  const time=(f:CheckInFailure)=>{const d=f.at?.toDate?.();return d?new Intl.DateTimeFormat('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit'}).format(d):''}
  return <article className="panel"><p className="eyebrow">Door</p><h2>Check-in problems</h2>
    {items.length?<ul className="checkin-problems">{items.map(item=><li key={item.id}>
      <strong>{time(item)}</strong>
      <span>{item.memberName||'Unknown person'}{item.memberNumber?` · ${item.memberNumber}`:''}</span>
      <small>{item.reason||'Check-in failed'}</small>
    </li>)}</ul>:<p className="muted">No failed check-ins recorded. Anyone turned away at the door will show here with the time, so you can check the camera.</p>}
  </article>
}
function FeedbackPanel(){
  const[items,setItems]=useState<Feedback[]>([])
  useEffect(()=>{if(!firebaseConfigured)return;return onSnapshot(query(collection(db,'sessionFeedback'),orderBy('updatedAt','desc'),limit(12)),snapshot=>setItems(snapshot.docs.map(item=>({id:item.id,...item.data()}) as Feedback)),()=>setItems([]))},[])
  const when=(f:Feedback)=>{const d=f.visitAt?.toDate?.()||f.updatedAt?.toDate?.();return d?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'}).format(d):''}
  const avg=items.length?items.reduce((sum,f)=>sum+(f.rating||0),0)/items.length:0
  return <article className="panel"><p className="eyebrow">Happiness-ometer</p><h2>How members are feeling{avg?<span className="hap-avg"> · {avg.toFixed(1)}/5 {FACES[Math.round(avg)-1]||''}</span>:null}</h2>{items.length?items.map(f=><div className="feedback-row" key={f.id}><span className="feedback-face">{FACES[f.rating-1]||'😐'}</span><div><strong>{f.memberName}</strong>{f.prompt&&<small className="feedback-prompt">{f.prompt}</small>}{f.comment?<p>{f.comment}</p>:<p className="muted-note">No comment left</p>}</div><small>{when(f)}</small></div>):<p>No responses yet — members are asked when they open the app.</p>}</article>}

type Session={id:string;nameSnapshot:string;startsAt:Date;locationSnapshot:string;capacity:number;bookedCount:number}
type PlanInfo={name:string;price:number;interval:string}
type GoalEntry={kind?:string;value?:number;rating?:number;loggedAt?:{toDate():Date}|Date}
type GoalProgress={startValue?:number;targetValue?:number;focus?:string;startedAt?:{toDate():Date}|Date;lastEntryAt?:{toDate():Date}|Date;entries?:GoalEntry[]}
type MemberLite={id:string;firstName?:string;lastName?:string;membershipTypeId?:string;membershipStatus?:string;priceMinor?:number;cancellationAcknowledged?:boolean;createdAt?:{toDate():Date}|Date;cashSchedule?:{nextDueAt?:{toDate():Date}|Date;amountMinor?:number};goal?:string;goalProgress?:GoalProgress}
type ShopOrderLite={id:string;productName:string;memberName:string;fulfilmentStatus:string}
const toDate=(v?:{toDate():Date}|Date|null):Date|null=>!v?null:v instanceof Date?v:v.toDate()
const goalNames:Record<string,string>={weight_loss:'Weight loss',muscle:'Muscle building',fun:'Fun & events',wellness:'Wellness'}
type GoalSignal={member:MemberLite;tone:'support'|'smashing';priority:number;title:string;detail:string}
function goalSignal(member:MemberLite):GoalSignal|null{const goal=member.goal,progress=member.goalProgress,entries=progress?.entries||[];if(!goal||!progress?.startedAt||!entries.length)return null;const latest=entries.at(-1),name=`${member.firstName||''} ${member.lastName||''}`.trim(),base={member,title:name,priority:1};if(goal==='weight_loss'&&latest?.value&&progress.startValue&&progress.targetValue){const recent=entries.filter(e=>typeof e.value==='number').slice(-3),achieved=latest.value<=progress.targetValue;if(achieved)return{...base,tone:'smashing',priority:3,detail:'Reached their weight goal'};if(recent.length===3&&recent[0].value!<recent[1].value!&&recent[1].value!<recent[2].value!)return{...base,tone:'support',priority:3,detail:'Weight trend is moving away from their goal'};const total=progress.startValue-progress.targetValue,pct=total>0?(progress.startValue-latest.value)/total:0;if(pct>=.25)return{...base,tone:'smashing',priority:pct>=.75?2:1,detail:`Making strong progress · ${Math.round(pct*100)}%`}}
  if(goal==='muscle'&&latest?.value&&progress.startValue){if(progress.targetValue&&latest.value>=progress.targetValue)return{...base,tone:'smashing',priority:3,detail:`Reached their ${progress.focus||'strength'} target`};if(latest.value>progress.startValue)return{...base,tone:'smashing',priority:1,detail:`New progress on ${progress.focus||'their key exercise'}`}}
  if(goal==='wellness'){const ratings=entries.filter(e=>e.rating).slice(-3).map(e=>e.rating!);if(ratings.length>=3){const avg=ratings.reduce((a,b)=>a+b,0)/ratings.length;if(avg<=2.3)return{...base,tone:'support',priority:3,detail:'Several low wellbeing check-ins'};if(avg>=4)return{...base,tone:'smashing',priority:1,detail:'Wellbeing check-ins are looking great'}}}
  if(goal==='fun'&&entries.length>=3)return{...base,tone:'smashing',priority:entries.length>=5?2:1,detail:`Getting involved · ${entries.length} activities logged`}
  const last=toDate(progress.lastEntryAt);if(last&&Date.now()-last.getTime()>30*864e5)return{...base,tone:'support',priority:1,detail:`No goal check-in for ${Math.floor((Date.now()-last.getTime())/864e5)} days`};return null}

export function DashboardPage(){
  const [sessions,setSessions]=useState<Session[]>([])
  const [inGym,setInGym]=useState(0)
  const [visitsToday,setVisitsToday]=useState(0)
  const [members,setMembers]=useState<MemberLite[]>([])
  const [plans,setPlans]=useState<Record<string,PlanInfo>>({})
  const [shopOrders,setShopOrders]=useState<ShopOrderLite[]>([])
  useEffect(()=>{
    if(!firebaseConfigured)return
    const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);end.setDate(end.getDate()+1)
    const unsubscribers=[
      onSnapshot(query(collection(db,'classSessions'),where('startsAt','>=',start),where('startsAt','<',end),orderBy('startsAt')),snapshot=>setSessions(snapshot.docs.map(item=>{const data=item.data();return{id:item.id,...data,startsAt:data.startsAt.toDate()} as Session}))),
      onSnapshot(query(collection(db,'visits'),where('checkedOutAt','==',null)),snapshot=>setInGym(snapshot.docs.filter(item=>item.get('countsTowardOccupancy')!==false&&item.get('scheduledCheckoutAt').toMillis()>Date.now()).length)),
      onSnapshot(query(collection(db,'visits'),where('checkedInAt','>=',start)),snapshot=>setVisitsToday(snapshot.docs.filter(item=>item.get('countsTowardOccupancy')!==false).length)),
      onSnapshot(collection(db,'members'),snapshot=>setMembers(snapshot.docs.map(item=>({id:item.id,...item.data()}) as MemberLite))),
      onSnapshot(collection(db,'membershipTypes'),snapshot=>setPlans(Object.fromEntries(snapshot.docs.map(item=>[item.id,{name:String(item.get('name')||item.id),price:Number(item.get('priceMinor')||0),interval:String(item.get('billingInterval')||'monthly')}])))),
    ]
    return()=>unsubscribers.forEach(unsubscribe=>unsubscribe())
  },[])
  useEffect(()=>{let active=true;async function load(){try{const{data}=await httpsCallable<unknown,{orders:ShopOrderLite[]}>(functions,'listShopOrders')({});if(active)setShopOrders(data.orders.filter(order=>order.fulfilmentStatus!=='delivered'))}catch{if(active)setShopOrders([])}}load();const timer=window.setInterval(load,60000);return()=>{active=false;window.clearInterval(timer)}},[])
  const byPlan=useMemo(()=>{
    const counts:Record<string,number>={}
    for(const item of members){const key=item.membershipTypeId||'none';counts[key]=(counts[key]||0)+1}
    return Object.entries(counts)
      .map(([id,count])=>({id,name:id==='none'?'No membership (prospects)':(plans[id]?.name||id),count}))
      .sort((a,b)=>b.count-a.count)
  },[members,plans])
  const stats=useMemo(()=>{
    const startToday=new Date();startToday.setHours(0,0,0,0)
    let active=0,failed=0,cancelled=0,newToday=0,incomeMinor=0
    for(const m of members){
      const status=String(m.membershipStatus||'')
      // A failed payment doesn't mean they've left — they're still an active member.
      const isMember=status==='active'||status==='payment_failed'
      if(isMember){active++;const info=plans[m.membershipTypeId||''];const price=(typeof m.priceMinor==='number'?m.priceMinor:info?.price)||0;incomeMinor+=info?.interval==='annual'?Math.round(price/12):price}
      if(status==='payment_failed')failed++
      if(status==='cancelled'&&!m.cancellationAcknowledged)cancelled++
      const created=toDate(m.createdAt);if(created&&created>=startToday)newToday++
    }
    return{active,failed,cancelled,issues:failed+cancelled,newToday,incomeMinor}
  },[members,plans])
  const totalMembers=members.length
  const cashDue=useMemo(()=>{const soon=Date.now()+3*864e5;let overdue=0,count=0;for(const m of members){const d=toDate(m.cashSchedule?.nextDueAt);if(d&&d.getTime()<=soon){count++;if(d.getTime()<Date.now())overdue++}}return{count,overdue}},[members])
  const goalSignals=useMemo(()=>members.map(goalSignal).filter((item):item is GoalSignal=>!!item).sort((a,b)=>(a.tone==='support'?0:1)-(b.tone==='support'?0:1)||b.priority-a.priority||a.title.localeCompare(b.title)),[members])
  const {user}=useAuth()
  const hour=new Date().getHours(),greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'
  const staffName=(user?.displayName||'').trim().split(' ')[0]||'team'
  const tiles:{label:string;value:string;note:string;to?:string}[]=[
    {label:'Active members',value:String(stats.active),note:stats.newToday?`+${stats.newToday} new today — see who →`:`${totalMembers} registered users`,to:stats.newToday?'/members?new=1':undefined},
    {label:'Monthly income',value:`£${(stats.incomeMinor/100).toLocaleString('en-GB',{maximumFractionDigits:0})}`,note:'From active plans'},
    {label:'In the gym',value:String(inGym),note:`Now · ${visitsToday} ${visitsToday===1?'visit':'visits'} today`},
    {label:'Payment issues',value:String(stats.issues),note:stats.issues?(stats.cancelled?`${stats.failed} failed · ${stats.cancelled} cancelled`:'View who →'):'All good',to:stats.issues?'/members?issues=1':undefined},
  ]
  return <>
    <header className="page-head"><div><p className="eyebrow">{new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</p><h1>{greeting}, {staffName}</h1><p>Here’s what is happening at the gym today.</p></div><NavLink className="primary" to="/members">Add member</NavLink></header>
    <section className="metrics">{tiles.map(m=>m.to?<NavLink className="metric metric-link" key={m.label} to={m.to}><span>{m.label}</span><strong>{m.value}</strong><small>{m.note}</small></NavLink>:<article className="metric" key={m.label}><span>{m.label}</span><strong>{m.value}</strong><small>{m.note}</small></article>)}</section>
    {cashDue.count>0&&<NavLink to="/payments" className={`cash-alert${cashDue.overdue?' overdue':''}`}><strong>{cashDue.count}</strong><span>cash payment{cashDue.count>1?'s':''} to collect{cashDue.overdue?` · ${cashDue.overdue} overdue`:' · due soon'}</span><em>Open payments →</em></NavLink>}
    <NavLink to="/shop-products#orders" className={`panel dashboard-shop-orders${shopOrders.length?' has-orders':''}`}><Package/><div><p className="eyebrow">Shop orders</p><h2>{shopOrders.length?`${shopOrders.length} to fulfil`:'Nothing waiting'}</h2><p>{shopOrders.length?shopOrders.slice(0,2).map(order=>`${order.memberName} · ${order.productName}`).join('  •  '):'Paid physical products will appear here.'}</p></div><strong>Open Gym Shop →</strong></NavLink>
    <article className="panel goal-radar"><div className="goal-radar-head"><div><p className="eyebrow">Member goal radar</p><h2>Who may appreciate attention</h2><p>Support first, celebrations second. Members progressing steadily stay out of this queue.</p></div><div className="goal-radar-counts"><span className="support">{goalSignals.filter(s=>s.tone==='support').length} check-ins</span><span className="smashing">{goalSignals.filter(s=>s.tone==='smashing').length} smashing it</span></div></div>{goalSignals.length?<div className="goal-signal-list">{goalSignals.slice(0,10).map(signal=><div className={`goal-signal ${signal.tone}`} key={signal.member.id}><span className="goal-signal-dot"/><div><strong>{signal.title}</strong><small>{goalNames[signal.member.goal||'']||'Personal goal'} · {signal.detail}</small></div><em>{signal.tone==='support'?'Friendly check-in':'Celebrate'}</em></div>)}</div>:<p className="no-results">No special attention needed right now. Goal updates will be prioritised here as members begin checking in.</p>}</article>
    <section className="split">
      <article className="panel"><p className="eyebrow">Live schedule</p><h2>Today’s classes</h2>{sessions.length?sessions.map(session=><NavLink className="class-row class-row-link" key={session.id} to={`/classes?session=${session.id}`}><time>{session.startsAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time><strong>{session.nameSnapshot}</strong><span>{session.bookedCount}/{session.capacity} →</span></NavLink>):<p className="no-results">No classes scheduled today.</p>}</article>
      <article className="panel"><p className="eyebrow">Membership mix</p><h2>Members by plan{totalMembers?<span className="muted"> · {totalMembers} total</span>:null}</h2>{byPlan.length?byPlan.map(row=><NavLink className="plan-row" key={row.id} to={`/members?plan=${encodeURIComponent(row.id)}`}><strong>{row.name}</strong><span>{row.count}</span></NavLink>):<p>No members yet — add your first member to see the breakdown.</p>}</article>
    </section>
    <section className="split">
      <CheckInProblemsPanel/><FeedbackPanel/>
      <article className="panel accent"><p className="eyebrow">Quick check-in</p><h2>Welcome members in seconds</h2><p>Display the rotating gym QR or find a member by name.</p><NavLink className="primary" to="/check-in">Open check-in</NavLink></article>
    </section>
  </>
}
