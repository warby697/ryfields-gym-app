import {AlertTriangle,CheckCircle2,Download,FileSpreadsheet,Landmark,LockKeyhole,Upload,XCircle} from 'lucide-react'
import {doc,onSnapshot,serverTimestamp,setDoc} from 'firebase/firestore'
import {useEffect,useMemo,useRef,useState} from 'react'
import {useAuth} from '../auth/AuthProvider'
import {db,firebaseConfigured} from '../../lib/firebase'
import {buildStatementCsv,mergeCashReports,transformCashReport,type CashImportResult,type CashImportRow} from './cashImport'

const gbp=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'})
const dayLabel=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long'})
type BankSession={id:string;closedAt:string;throughDate:string;amount:number;rowIds:string[];snapshots:Record<string,string>}
type DayCheck={expected:number;status:'correct'|'incorrect';actual?:string}
type MonthState={sessions:BankSession[];checks:Record<string,DayCheck>}
type CloudMonth={result:CashImportResult;monthState:MonthState;downloaded:boolean}
const storageKey=(month:string)=>`ryfields-cash-banking:v4:${month}`
const reportStorageKey='ryfields-cash-report:v1'
const rowSnapshot=(row:CashImportRow)=>JSON.stringify([row.date,row.amount,row.payee,row.description,row.reference])
function loadMonth(month:string):MonthState{try{const saved=JSON.parse(localStorage.getItem(storageKey(month))||'{}');return{sessions:Array.isArray(saved.sessions)?saved.sessions:[],checks:saved.checks&&typeof saved.checks==='object'?saved.checks:{}}}catch{return{sessions:[],checks:{}}}}
function saveMonth(month:string,state:MonthState){localStorage.setItem(storageKey(month),JSON.stringify(state))}
function restoreClosedRows(result:CashImportResult,state:MonthState):CashImportResult{
  const rows=new Map(result.rows.map(row=>[row.id,row]))
  for(const session of state.sessions)for(const [id,snapshot] of Object.entries(session.snapshots)){
    if(rows.has(id))continue
    try{
      const[date,amount,payee,description,reference]=JSON.parse(snapshot) as[string,number,string,string,string]
      rows.set(id,{id,date,amount,payee,description,reference,source:id.startsWith('daily-')?'daily':'expense',resolved:Boolean(payee)})
    }catch{/* An invalid legacy snapshot remains visible through the historical-change safeguard. */}
  }
  const restored=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount)
  return{...result,rows:restored,fromDate:result.fromDate||restored[0]?.date||result.throughDate}
}

export function CashImportPage(){
  const{user}=useAuth()
  const[result,setResult]=useState<CashImportResult|null>(null),[monthState,setMonthState]=useState<MonthState>({sessions:[],checks:{}}),[error,setError]=useState(''),[downloaded,setDownloaded]=useState(false),[activeMonth,setActiveMonth]=useState(''),[cloudLoaded,setCloudLoaded]=useState(!firebaseConfigured),[saving,setSaving]=useState(false)
  const inputRef=useRef<HTMLInputElement>(null)
  const migrationStarted=useRef(false)
  const cloudWriteQueue=useRef<Promise<unknown>>(Promise.resolve())
  const pendingCloudWrites=useRef(0)
  const closedIds=useMemo(()=>new Set(monthState.sessions.flatMap(session=>session.rowIds)),[monthState])
  const closedDates=useMemo(()=>new Set(monthState.sessions.flatMap(session=>session.rowIds.map(id=>session.snapshots[id]).filter(Boolean).map(snapshot=>JSON.parse(snapshot)[0] as string))),[monthState])
  const unclosedRows=result?.rows.filter(row=>!closedIds.has(row.id))??[]
  const days=useMemo(()=>{
    const grouped=new Map<string,CashImportRow[]>()
    for(const row of unclosedRows)grouped.set(row.date,[...(grouped.get(row.date)??[]),row])
    return[...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,rows,expected:Math.round(rows.reduce((sum,row)=>sum+row.amount,0)*100)/100}))
  },[unclosedRows])
  const confirmedDays=useMemo(()=>{
    const confirmed:typeof days=[]
    for(const day of days){
      const check=monthState.checks[day.date],actual=Number(check?.actual)
      if(!check||check.expected!==day.expected)break
      if(check.status==='incorrect'&&(!String(check.actual??'').trim()||!Number.isFinite(actual)))break
      confirmed.push(day)
    }
    return confirmed
  },[days,monthState.checks])
  const visibleDays=days.slice(0,Math.min(days.length,confirmedDays.length+1))
  const waitingDays=Math.max(0,days.length-visibleDays.length)
  const runningTotal=Math.round(confirmedDays.reduce((sum,day)=>{
    const check=monthState.checks[day.date]
    return sum+(check?.status==='incorrect'?Number(check.actual):day.expected)
  },0)*100)/100
  const sourceIssues=(result?.excluded.length??0)+(result?.rows.filter(row=>!row.resolved).length??0)
  const historicalChanges=useMemo(()=>{
    if(!result)return[]
    const current=new Map(result.rows.map(row=>[row.id,rowSnapshot(row)])),changes:string[]=[]
    for(const session of monthState.sessions)for(const id of session.rowIds)if(current.get(id)!==session.snapshots[id])changes.push(id)
    for(const row of result.rows)if(closedDates.has(row.date)&&!closedIds.has(row.id))changes.push(row.id)
    return[...new Set(changes)]
  },[result,monthState,closedDates,closedIds])
  const confirmedThrough=confirmedDays.at(-1)?.date??''
  const canBank=!!result&&confirmedDays.length>0&&!historicalChanges.length
  const monthEnd=result?new Date(Number(result.month.slice(0,4)),Number(result.month.slice(5,7)),0).getDate():0
  const reportComplete=!!result&&Number(result.throughDate.slice(8,10))===monthEnd
  const canDownload=!!result&&!historicalChanges.length

  useEffect(()=>{
    if(firebaseConfigured&&user){
      return onSnapshot(doc(db,'cashImportWorkspaces',user.uid),snapshot=>{
        const month=String(snapshot.get('activeMonth')||'')
        setActiveMonth(month)
        if(!month&&!migrationStarted.current){
          migrationStarted.current=true
          try{
            const saved=JSON.parse(localStorage.getItem(reportStorageKey)||'null')
            if(saved?.text&&saved?.name){
              const restored=transformCashReport(saved.text,saved.name),state=loadMonth(restored.month)
              void saveCloud(restored,state,!!saved.downloaded)
            }else setCloudLoaded(true)
          }catch{setCloudLoaded(true)}
        }
      },()=>{setError('Your saved cash month could not be loaded. Check your connection and refresh.');setCloudLoaded(true)})
    }
    try{
      const saved=JSON.parse(localStorage.getItem(reportStorageKey)||'null')
      if(!saved?.text||!saved?.name){setCloudLoaded(true);return}
      const restored=transformCashReport(saved.text,saved.name)
      setResult(restored);setMonthState(loadMonth(restored.month));setDownloaded(!!saved.downloaded);setCloudLoaded(true)
    }catch{localStorage.removeItem(reportStorageKey);setCloudLoaded(true)}
  },[user])

  useEffect(()=>{
    if(!firebaseConfigured||!user||!activeMonth)return
    setCloudLoaded(false)
    return onSnapshot(doc(db,'cashImportWorkspaces',user.uid,'months',activeMonth),snapshot=>{
      if(snapshot.exists()&&!pendingCloudWrites.current){
        const saved=snapshot.data() as CloudMonth
        if(saved.result?.month===activeMonth){
          const state=saved.monthState||{sessions:[],checks:{}}
          setResult(restoreClosedRows(saved.result,state));setMonthState(state);setDownloaded(!!saved.downloaded)
        }
      }
      setCloudLoaded(true)
    },()=>{setError('Your saved cash month could not be loaded. Check your connection and refresh.');setCloudLoaded(true)})
  },[user,activeMonth])

  async function saveCloud(nextResult:CashImportResult,nextState:MonthState,nextDownloaded=downloaded){
    if(!firebaseConfigured||!user)return
    if(JSON.stringify({result:nextResult,monthState:nextState}).length>900_000)throw new Error('This report is too large to save safely.')
    pendingCloudWrites.current++
    const write=cloudWriteQueue.current.then(()=>Promise.all([
      setDoc(doc(db,'cashImportWorkspaces',user.uid),{activeMonth:nextResult.month,updatedAt:serverTimestamp()},{merge:true}),
      setDoc(doc(db,'cashImportWorkspaces',user.uid,'months',nextResult.month),{result:nextResult,monthState:nextState,downloaded:nextDownloaded,updatedAt:serverTimestamp()},{merge:true}),
    ]))
    cloudWriteQueue.current=write.catch(()=>undefined)
    try{await write}finally{pendingCloudWrites.current--}
  }

  async function upload(file?:File){
    if(!file)return
    setError('');setSaving(true)
    try{
      const text=await file.text(),uploaded=transformCashReport(text,file.name)
      if(result&&result.month!==uploaded.month)throw new Error(`This is a ${uploaded.month} report, but ${result.month} is still active. Finish it and use Start next month first.`)
      const state=result?.month===uploaded.month?monthState:loadMonth(uploaded.month)
      const next=result?.month===uploaded.month?mergeCashReports(restoreClosedRows(result,state),uploaded):uploaded
      localStorage.setItem(reportStorageKey,JSON.stringify({text,name:file.name,downloaded:false}))
      setResult(next);setMonthState(state);setDownloaded(false)
      await saveCloud(next,state,false)
    }
    catch(reason){setError(reason instanceof Error?reason.message:'The cash report could not be read.')}
    finally{setSaving(false)}
  }
  async function updateCheck(date:string,check:DayCheck){
    if(!result)return
    const next={...monthState,checks:{...monthState.checks,[date]:check}};saveMonth(result.month,next);setMonthState(next)
    try{await saveCloud(result,next)}catch{setError('That envelope check could not be saved online. Please try it again.')}
  }
  async function bankNow(){
    if(!result||!canBank)return
    const throughDate=confirmedThrough,rowsToClose=unclosedRows.filter(row=>row.date<=throughDate),snapshots=Object.fromEntries(rowsToClose.map(row=>[row.id,rowSnapshot(row)]))
    const session:BankSession={id:`bank-${Date.now()}`,closedAt:new Date().toISOString(),throughDate,amount:runningTotal,rowIds:rowsToClose.map(row=>row.id),snapshots}
    const closedDaySet=new Set(confirmedDays.map(day=>day.date)),checks=Object.fromEntries(Object.entries(monthState.checks).filter(([date])=>!closedDaySet.has(date)))
    const next={sessions:[...monthState.sessions,session],checks};saveMonth(result.month,next);setMonthState(next)
    try{await saveCloud(result,next)}catch{setError('That banking batch could not be saved online. Do not treat it as closed yet.');setMonthState(monthState);saveMonth(result.month,monthState)}
  }
  async function download(){
    if(!result||!canDownload)return
    const url=URL.createObjectURL(new Blob([buildStatementCsv([...result.rows])],{type:'text/csv;charset=utf-8'})),link=document.createElement('a')
    link.href=url;link.download=`StatementImport_${result.month}.csv`;link.click();URL.revokeObjectURL(url);setDownloaded(true)
    try{const saved=JSON.parse(localStorage.getItem(reportStorageKey)||'null');if(saved)localStorage.setItem(reportStorageKey,JSON.stringify({...saved,downloaded:true}));await saveCloud(result,monthState,true)}catch{setError('The CSV downloaded, but its downloaded tick could not be saved online.')}
  }
  async function startNextMonth(){
    if(!result||!confirm(`Finish ${result.month} and start the next cash month? The completed month will remain saved in your account.`))return
    setSaving(true)
    try{
      migrationStarted.current=true
      if(firebaseConfigured&&user)await setDoc(doc(db,'cashImportWorkspaces',user.uid),{activeMonth:null,lastCompletedMonth:result.month,updatedAt:serverTimestamp()},{merge:true})
      localStorage.removeItem(reportStorageKey);setActiveMonth('');setResult(null);setMonthState({sessions:[],checks:{}});setDownloaded(false);setError('')
    }catch{setError('The month could not be closed online. Nothing has been cleared.')}
    finally{setSaving(false)}
  }
  return <>
    <header className="page-head"><div><p className="eyebrow">Admin only · saved securely to your account</p><h1>Cash envelopes</h1><p>Count each day, close the cash for banking, and prepare the final month-end CSV.</p></div></header>
    <section className="cash-import-intro panel"><FileSpreadsheet/><div><h2>Upload the latest cash report</h2><p>Upload it again whenever more days have been added.</p></div><input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={event=>upload(event.target.files?.[0])}/><button className="primary" disabled={saving||!cloudLoaded} onClick={()=>inputRef.current?.click()}><Upload/> {saving?'Saving…':'Choose cash report'}</button></section>
    {error&&<div className="cash-import-alert"><AlertTriangle/><div><strong>Cash record needs attention</strong><span>{error}</span></div></div>}
    {!cloudLoaded&&<div className="cash-import-alert"><FileSpreadsheet/><div><strong>Loading your saved cash month…</strong><span>Please wait before making changes.</span></div></div>}
    {result&&<>
      {!!result.ignoredLaterRows&&<p className="cash-overrun-note"><CheckCircle2/> {result.ignoredLaterRows} transaction row{result.ignoredLaterRows===1?'':'s'} from the following month ignored. This page is locked to {result.month}.</p>}
      {!!historicalChanges.length&&<div className="cash-import-alert"><LockKeyhole/><div><strong>Previously closed data has changed</strong><span>{historicalChanges.length} locked transaction{historicalChanges.length===1?'':'s'} changed, disappeared, or was added to a closed day. Banking and download are blocked.</span></div></div>}
      {!!sourceIssues&&<section className="panel cash-source-issues"><p className="eyebrow">Fix at the till</p><h2>The source report needs attention</h2><p>Correct these in the till system, then upload a new report.</p>{result.rows.filter(row=>!row.resolved).map(row=><div key={row.id}><span>{dayLabel.format(new Date(`${row.date}T12:00:00`))}</span><strong>{gbp.format(row.amount)} · Unidentified expense</strong><small>{row.description||'No useful description'}</small></div>)}{result.excluded.map((row,index)=><div key={`${row.date}-${index}`}><span>{dayLabel.format(new Date(`${row.date}T12:00:00`))}</span><strong>{gbp.format(row.amount)} · {row.type}</strong><small>{row.reason}</small></div>)}</section>}
      <div className="cash-workspace">
        <div className="cash-work-main">
          <section className="panel cash-daily-checks"><p className="eyebrow">Count the envelopes</p><h2>Cash not yet closed for banking</h2>{days.length?<>{visibleDays.map(day=>{const check=monthState.checks[day.date],valid=check?.expected===day.expected,actual=Number(check?.actual),difference=valid&&check?.status==='incorrect'&&Number.isFinite(actual)?Math.round((actual-day.expected)*100)/100:null;return <div className={`cash-day-row ${valid?check.status:''}`} key={day.date}><time>{dayLabel.format(new Date(`${day.date}T12:00:00`))}</time><strong>{gbp.format(day.expected)}</strong><div className="cash-day-actions"><button className={valid&&check.status==='correct'?'selected':''} onClick={()=>updateCheck(day.date,{expected:day.expected,status:'correct'})}><CheckCircle2/> Correct</button><button className={valid&&check.status==='incorrect'?'selected incorrect':''} onClick={()=>updateCheck(day.date,{expected:day.expected,status:'incorrect',actual:valid?check.actual:''})}><XCircle/> Not correct</button></div>{valid&&check.status==='incorrect'&&<label>Actual amount (£)<input autoFocus inputMode="decimal" value={check.actual??''} onChange={event=>updateCheck(day.date,{...check,actual:event.target.value})}/>{difference!==null&&<small className={difference===0?'match':'mismatch'}>{difference===0?'Amount matches—select Correct.':`${difference>0?'Over':'Short'} by ${gbp.format(Math.abs(difference))}`}</small>}</label>}</div>})}<div className="cash-bank-action"><div><small>Running total</small><strong>{gbp.format(runningTotal)} <span className="cash-admin-fee">{confirmedDays.length?'+ £1.00':'+ £0.00'}</span></strong><small>{confirmedDays.length?`Take ${gbp.format(runningTotal+1)} · ${confirmedDays.length} confirmed envelope${confirmedDays.length===1?'':'s'}`:'Confirm the first envelope to begin'}{waitingDays>0&&` · ${waitingDays} later report day${waitingDays===1?'':'s'} waiting`}</small></div><button className="primary" disabled={!canBank} onClick={bankNow}><Landmark/> Bank now</button></div></>:<div className="empty"><CheckCircle2/><h2>All uploaded cash is closed</h2><p>Upload a newer report when more days are ready to count.</p></div>}</section>
          <section className="panel cash-month-end"><div><p className="eyebrow">{reportComplete?'Month-end':'Preview'}</p><h2>{reportComplete?'Final statement-import CSV':'Statement-import CSV preview'}</h2><p>{reportComplete?'The complete report is ready to download.':`This preview includes the uploaded report through ${dayLabel.format(new Date(`${result.throughDate}T12:00:00`))}. Upload the complete report after month-end for the final CSV.`}</p></div><div className="cash-month-end-actions"><button className={`secondary ${downloaded?'downloaded':''}`} disabled={!canDownload} onClick={download}>{downloaded?<CheckCircle2/>:<Download/>} {downloaded?'Downloaded':reportComplete?'Download final CSV':'Download preview CSV'}</button>{reportComplete&&!unclosedRows.length&&<button className="primary" onClick={startNextMonth}>Start next month</button>}</div></section>
          <section className="panel cash-session-log"><p className="eyebrow">Banking log</p><h2>Cash closed for banking</h2>{monthState.sessions.length?monthState.sessions.map((session,index)=><div key={session.id}><span>Batch {index+1} · through {dayLabel.format(new Date(`${session.throughDate}T12:00:00`))}</span><strong>{gbp.format(session.amount)}</strong><small>Take {gbp.format(session.amount+1)}: {gbp.format(session.amount)} cash + <b>£1 from your pocket</b>.</small></div>):<p className="no-results">No cash has been closed yet.</p>}</section>
        </div>
      </div>
    </>}
  </>
}
