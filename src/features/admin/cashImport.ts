export const statementHeaders=['*Date','*Amount','Payee','Description','Reference','Check Number'] as const

export type CashImportRow={id:string;date:string;amount:number;payee:string;description:string;reference:string;source:'daily'|'expense'|'manual';resolved:boolean}
export type ExcludedCashRow={date:string;type:string;amount:number;comment:string;reason:string}
export type CashImportResult={rows:CashImportRow[];excluded:ExcludedCashRow[];month:string;sourceName:string;ignoredLaterRows:number;fromDate:string;throughDate:string}

function parseCsv(text:string){
  const records:string[][]=[];let record:string[]=[],cell='',quoted=false
  for(let index=0;index<text.length;index++){
    const char=text[index]
    if(quoted){if(char==='"'&&text[index+1]==='"'){cell+='"';index++}else if(char==='"')quoted=false;else cell+=char}
    else if(char==='"')quoted=true
    else if(char===','){record.push(cell);cell=''}
    else if(char==='\n'){record.push(cell.replace(/\r$/,''));records.push(record);record=[];cell=''}
    else cell+=char
  }
  if(cell||record.length){record.push(cell);records.push(record)}
  const headers=records.shift()?.map(item=>item.trim())??[]
  if(!headers.length)throw new Error('The uploaded file is empty.')
  return records.filter(row=>row.some(Boolean)).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??''])))
}

function isoDate(value:string){
  const match=value.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if(!match)throw new Error(`Unrecognised date: ${value||'blank'}`)
  return `${match[3]}-${match[2]}-${match[1]}`
}
function money(value:string){const parsed=Number(value||0);if(!Number.isFinite(parsed))throw new Error(`Invalid amount: ${value}`);return Math.round(parsed*100)/100}
function mapExpense(comment:string,reason:string){
  const text=`${comment} ${reason}`.toLowerCase()
  if(text.includes('mark'))return{payee:'Mark - Gazebos',description:'Gazebos',resolved:true}
  if(text.includes('tom'))return{payee:'Tom - Wages',description:'Wages',resolved:true}
  if(text.includes('nathaniel')||text.includes('nathanial'))return{payee:'Nathanial Wages',description:'Wages',resolved:true}
  return{payee:'',description:comment||reason||'',resolved:false}
}

export function transformCashReport(text:string,sourceName:string):CashImportResult{
  const source=parseCsv(text),required=['Date','Event name','Comment','Income','Expense','UUID']
  const missing=required.filter(header=>!(header in (source[0]??{})))
  if(missing.length)throw new Error(`This is not the expected cash report. Missing: ${missing.join(', ')}`)
  const months=[...new Set(source.map(item=>isoDate(item.Date).slice(0,7)))].sort(),month=months[0]??''
  if(!month)throw new Error('The report does not contain any dated transactions.')
  const monthDates=source.map(item=>isoDate(item.Date)).filter(date=>date.slice(0,7)===month).sort(),fromDate=monthDates[0]??'',throughDate=monthDates.at(-1)??''
  const daily=new Map<string,number>(),expenses:CashImportRow[]=[],excluded:ExcludedCashRow[]=[]
  let ignoredLaterRows=0
  for(const item of source){
    const date=isoDate(item.Date),type=item['Event name'].trim(),comment=item.Comment.trim(),reason=(item.Reason??'').trim(),amount=money(item.Income||item.Expense)
    if(date.slice(0,7)!==month){ignoredLaterRows++;continue}
    if(['Cash Sale','Cash Change','Cash Refund'].includes(type))daily.set(date,Math.round(((daily.get(date)??0)+amount)*100)/100)
    else if(type==='Cash out'){
      if(/error/i.test(comment)){excluded.push({date,type,amount,comment,reason:'Explicitly marked error'});continue}
      const mapped=mapExpense(comment,reason)
      expenses.push({id:item.UUID||`expense-${date}-${expenses.length}`,date,amount,payee:mapped.payee,description:mapped.description,reference:item.UUID,source:'expense',resolved:mapped.resolved})
    }else if(type==='Cash In')excluded.push({date,type,amount,comment,reason:'Cash-in anomaly excluded'})
  }
  const dailyRows=[...daily].map(([date,amount])=>({id:`daily-${date}`,date,amount,payee:'Cash sale',description:'Daily cash income',reference:'',source:'daily' as const,resolved:true}))
  const rows=[...dailyRows,...expenses].sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount)
  return{rows,excluded,month,sourceName,ignoredLaterRows,fromDate,throughDate}
}

export function mergeCashReports(previous:CashImportResult,next:CashImportResult):CashImportResult{
  if(previous.month!==next.month)return next
  const from=next.fromDate||[...next.rows.map(row=>row.date),...next.excluded.map(row=>row.date)].sort()[0]||next.throughDate
  const to=next.throughDate
  const outside=(date:string)=>date<from||date>to
  const rows=[...previous.rows.filter(row=>outside(row.date)),...next.rows]
  const uniqueRows=[...new Map(rows.map(row=>[row.id,row])).values()].sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount)
  const excluded=[...previous.excluded.filter(row=>outside(row.date)),...next.excluded]
  return{
    ...next,
    rows:uniqueRows,
    excluded,
    fromDate:[previous.fromDate,from].filter(Boolean).sort()[0]||from,
    throughDate:[previous.throughDate,next.throughDate].filter(Boolean).sort().at(-1)||next.throughDate,
  }
}

export function weekNumber(date:string){return Math.floor((Number(date.slice(8,10))-1)/7)+1}
export function weekTotal(rows:CashImportRow[],week:number){return Math.round(rows.filter(row=>weekNumber(row.date)===week).reduce((sum,row)=>sum+row.amount,0)*100)/100}
function csvCell(value:string){return /[",\n]/.test(value)?`"${value.replaceAll('"','""')}"`:value}
export function buildStatementCsv(rows:CashImportRow[]){
  const body=rows.sort((a,b)=>a.date.localeCompare(b.date)||b.amount-a.amount).map(row=>[row.date,row.amount.toFixed(2),row.payee,row.description,row.reference,''])
  return [statementHeaders,...body].map(row=>row.map(value=>csvCell(String(value))).join(',')).join('\r\n')+'\r\n'
}
