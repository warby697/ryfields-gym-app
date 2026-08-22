import {describe,expect,it} from 'vitest'
import {buildStatementCsv,mergeCashReports,transformCashReport,weekTotal} from '../src/features/admin/cashImport'

describe('monthly cash import',()=>{
  it('reconciles the confirmed July sample rules',()=>{
    const headings=['Merchant Id','Date','UUID','Nr','Email','Event name','Reason','Comment','Income','Expense','Balance','Expected amount','Difference','Currency']
    const row=(date:string,id:string,type:string,income='',expense='',comment='',reason='')=>['M',`${date} 12:00:00`,id,'1','admin@example.com',type,reason,comment,income,expense,'','','','GBP'].join(',')
    const source=[
      headings.join(','),
      row('01-07-2026','w1-sales','Cash Sale','504.95'),
      row('01-07-2026','w1-tom','Cash out','','-40.00','Tom'),
      row('03-07-2026','w1-mark','Cash out','','-20.00','Mark'),
      row('05-07-2026','w1-nathanial','Cash out','','-40.00','Nathanial'),
      row('08-07-2026','w2-sales','Cash Sale','578.75'),
      row('09-07-2026','w2-refund','Cash Refund','','-4.50'),
      row('12-07-2026','w2-tom','Cash out','','-40.00','Tom'),
      row('13-07-2026','w2-mark','Cash out','','-20.00','Mark'),
      row('15-07-2026','w3-sales','Cash Sale','459.65'),
      row('15-07-2026','error-1','Cash out','','-8.90','error'),
      row('15-07-2026','error-2','Cash out','','-1.00','error'),
      row('15-07-2026','error-3','Cash out','','-0.10','error'),
      row('15-07-2026','cash-in','Cash In','10.00'),
      row('17-07-2026','w3-mark','Cash out','','-20.00','Mark'),
      row('19-07-2026','w3-nathanial','Cash out','','-40.00','Nathaniel'),
      row('01-08-2026','next-month','Cash Sale','99.00'),
    ].join('\n')
    const result=transformCashReport(source,'july-cash-report.csv')
    result.rows.push({id:'manual-tom',date:'2026-07-11',amount:-40,payee:'Tom - Wages',description:'Wages',reference:'Manually confirmed',source:'manual',resolved:true})
    expect(weekTotal(result.rows,1)).toBe(404.95)
    expect(weekTotal(result.rows,2)).toBe(474.25)
    expect(weekTotal(result.rows,3)).toBe(399.65)
    expect(result.excluded.map(row=>row.amount)).toEqual(expect.arrayContaining([-8.9,-1,-.1,10]))
    expect(result.ignoredLaterRows).toBe(1)
    expect(result.rows.every(row=>row.date.startsWith('2026-07'))).toBe(true)
    const csv=buildStatementCsv(result.rows)
    expect(csv).toContain('*Date,*Amount,Payee,Description,Reference,Check Number')
    expect(csv).toContain('Cash sale,Daily cash income')
    expect(csv).toContain('Tom - Wages,Wages')
    expect(csv).not.toContain('Cash refund')
  })

  it('merges a later partial report without losing earlier July rows',()=>{
    const headings=['Merchant Id','Date','UUID','Nr','Email','Event name','Reason','Comment','Income','Expense','Balance','Expected amount','Difference','Currency']
    const row=(date:string,id:string,income:string)=>['M',`${date} 12:00:00`,id,'1','admin@example.com','Cash Sale','','',income,'','','','','GBP'].join(',')
    const earlier=transformCashReport([headings.join(','),row('01-07-2026','one','10.00'),row('26-07-2026','twenty-six','20.00')].join('\n'),'earlier.csv')
    const later=transformCashReport([headings.join(','),row('27-07-2026','twenty-seven','101.83'),row('30-07-2026','thirty','40.00'),row('02-08-2026','august','50.00')].join('\n'),'later.csv')
    const merged=mergeCashReports(earlier,later)
    expect(merged.fromDate).toBe('2026-07-01')
    expect(merged.throughDate).toBe('2026-07-30')
    expect(merged.rows.map(item=>item.date)).toEqual(['2026-07-01','2026-07-26','2026-07-27','2026-07-30'])
    expect(merged.rows.reduce((sum,item)=>sum+item.amount,0)).toBeCloseTo(171.83,2)
  })
})
