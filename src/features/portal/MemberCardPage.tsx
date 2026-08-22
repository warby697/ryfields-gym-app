import { Maximize2,RotateCcw } from 'lucide-react'
import { useRef,useState } from 'react'

type CardMember={firstName:string;lastName:string;memberNumber:string;membershipStatus:string;membershipTypeName?:string;membershipTypeId:string}

export function MemberCardPage({member}:{member:CardMember}){
  const card=useRef<HTMLElement>(null),[full,setFull]=useState(false)
  async function expand(){setFull(true);try{await card.current?.requestFullscreen?.();await screen.orientation?.lock?.('landscape')}catch{/* Orientation locking is optional on the web. */}}
  return <><header className="page-head card-page-head"><div><p className="eyebrow">Membership card</p><h1>Your Ryfields Gym card</h1><p>Turn your phone sideways or open it full screen at reception.</p></div></header><div className={`digital-card-stage${full?' is-full':''}`} onClick={()=>setFull(false)}><section className="member-card digital-card" ref={card} onClick={e=>e.stopPropagation()}><div className="card-brand"><img src="/logo.png" alt=""/><small>RYFIELDS GYM</small></div><div><h2>{member.firstName} {member.lastName}</h2><p>{member.membershipTypeName||member.membershipTypeId} membership</p></div><strong>{member.memberNumber}</strong><span>{member.membershipStatus.toUpperCase().replace('_',' ')}</span></section></div><div className="card-actions"><button className="primary" onClick={expand}><Maximize2/> Show full screen</button><p><RotateCcw/> Best viewed with your phone sideways</p></div><article className="panel card-discount"><p className="eyebrow">Member benefits</p><h2>Your discount card too</h2><p>This same card will hold any future Blue Bunker and Ryfields Gym member offers—no second card needed.</p></article></>
}
