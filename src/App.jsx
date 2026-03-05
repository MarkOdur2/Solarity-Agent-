import { useState, useRef, useCallback, useEffect } from "react";

// ── DATA ─────────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { value:"zambia",      flag:"🇿🇲", label:"Zambia",      cities:["Lusaka","Copperbelt","Kitwe","Ndola","Solwezi","Livingstone"] },
  { value:"uganda",      flag:"🇺🇬", label:"Uganda",      cities:["Kampala","Jinja","Mbarara","Gulu","Entebbe"] },
  { value:"tanzania",    flag:"🇹🇿", label:"Tanzania",    cities:["Dar es Salaam","Arusha","Mwanza","Mbeya"] },
  { value:"drc",         flag:"🇨🇩", label:"DRC",         cities:["Kinshasa","Lubumbashi","Kolwezi","Goma"] },
  { value:"ghana",       flag:"🇬🇭", label:"Ghana",       cities:["Accra","Kumasi","Tema","Obuasi","Tarkwa"] },
  { value:"kenya",       flag:"🇰🇪", label:"Kenya",       cities:["Nairobi","Mombasa","Thika","Nakuru"] },
  { value:"zimbabwe",    flag:"🇿🇼", label:"Zimbabwe",    cities:["Harare","Bulawayo","Mutare"] },
  { value:"south_sudan", flag:"🇸🇸", label:"South Sudan", cities:["Juba","Malakal","Wau"] },
];

const SECTORS = [
  { value:"mining",          label:"Mining & Minerals",    icon:"⛏",  bench:"5-30 MWp" },
  { value:"manufacturing",   label:"Manufacturing",        icon:"🏭",  bench:"500 kWp-5 MWp" },
  { value:"hospitality",     label:"Hotels & Hospitality", icon:"🏨",  bench:"200 kWp-1 MWp" },
  { value:"beverages",       label:"Beverages & Brewery",  icon:"🍺",  bench:"1-5 MWp" },
  { value:"agro_processing", label:"Agro-Processing",      icon:"🌾",  bench:"200 kWp-3 MWp" },
  { value:"cold_chain",      label:"Cold Chain",           icon:"❄️",  bench:"200 kWp-2 MWp" },
  { value:"cement",          label:"Cement & Construction",icon:"🏗️",  bench:"5-30 MWp" },
  { value:"healthcare",      label:"Healthcare",           icon:"🏥",  bench:"300 kWp-1.5 MWp" },
  { value:"logistics",       label:"Logistics",            icon:"🚛",  bench:"200 kWp-2 MWp" },
  { value:"telecom",         label:"Telecom Towers",       icon:"📡",  bench:"20-50 kWp/tower" },
];

const TIERS = {
  hot:          { label:"HOT",  color:"#FF4B4B", bg:"rgba(255,75,75,0.12)",  border:"rgba(255,75,75,0.4)" },
  warm:         { label:"WARM", color:"#F0A500", bg:"rgba(240,165,0,0.12)",  border:"rgba(240,165,0,0.4)" },
  cool:         { label:"COOL", color:"#38BDF8", bg:"rgba(56,189,248,0.10)", border:"rgba(56,189,248,0.35)" },
  disqualified: { label:"DISQ", color:"#4A5568", bg:"rgba(74,85,104,0.10)",  border:"rgba(74,85,104,0.3)" },
};

// ── PROMPTS ───────────────────────────────────────────────────────────────────

const GEMINI_DISCOVER_PROMPT = (country, sectors, geo, minLoad) => {
  const cLabel = COUNTRIES.find(c=>c.value===country)?.label||country;
  const sLabels = sectors.map(s=>SECTORS.find(x=>x.value===s)?.label).filter(Boolean).join(", ");
  const loc = geo||COUNTRIES.find(c=>c.value===country)?.cities[0]||country;
  return `You are an expert business researcher finding African C&I solar energy prospects. Use Google Search to find REAL named companies.

Find large commercial and industrial companies that are strong C&I solar candidates in:
Country: ${cLabel}
Sectors: ${sLabels}  
Location focus: ${loc}
Minimum estimated electricity load: ${minLoad} kWp

Search thoroughly using multiple queries. Find companies with:
- Significant electricity consumption (${minLoad}+ kWp estimated)
- Exposure to grid unreliability or high electricity costs
- Real, verifiable operations in ${loc}, ${cLabel}

STRICT RULES:
- Only REAL companies with confirmed operations -- verifiable names and locations
- Minimum ~100 employees or clearly large-scale industrial operation
- EXCLUDE government utilities (ZESCO, UMEME, TANESCO, SNEL, ECG, KPLC) and NGOs
- Maximum 10 results

Return ONLY a valid JSON array. No markdown fences, no explanation.
Schema: [{"name":"string","sector":"string","city":"string","region":"string","description":"operations and scale","energy_signals":"electricity pain evidence","website":"url or null","phone":"string or null","employees":"estimate","address":"string or null"}]`;
};

const CLAUDE_QUALIFY_PROMPT = (co, country, minLoad) => {
  const cLabel = COUNTRIES.find(c=>c.value===country)?.label||country;
  return `You are the world's foremost expert in C&I solar project development across Sub-Saharan Africa. Score this company as a solar prospect.

Company: ${co.name}
Country: ${cLabel}
Sector: ${co.sector||"unknown"}
Location: ${co.city||"?"}, ${co.region||""}
Employees: ${co.employees||"unknown"}
Website: ${co.website||"none"}
Description: ${co.description||"not available"}
Energy signals: ${co.energy_signals||"none noted"}
Min load threshold: ${minLoad} kWp

SCORING (100 points total):
- Load Potential (30pts): 25-30=500kWp+, 15-24=200-500kWp, 8-14=100-200kWp
- Grid Reliability (20pts): 17-20=less than 8hrs supply per day, 10-16=8-14hrs
- Revenue Currency (15pts): 13-15=USD revenues, 7-12=USD-linked
- Creditworthiness (15pts): 13-15=listed/multinational, 7-12=established 5+ years
- Diesel Dependency (10pts): 8-10=confirmed generator use
- Decision-Maker Access (10pts): 8-10=named contact findable online

CALIBRATION RULES:
- Zambia/DRC mining: score 75+ automatically
- Hotels 100+ rooms: diesel score 8-10 (confirmed generators)
- DRC all industrial: diesel score 7+ default
- Government utilities: disqualify immediately (score 0)

Tiers: hot=75-100, warm=50-74, cool=25-49, disqualified=0-24

Return ONLY valid JSON (no markdown):
{"score":integer,"tier":"hot|warm|cool|disqualified","confidence":integer,"load_kwp":integer_or_null,"capex_min":integer_or_null,"capex_max":integer_or_null,"structure":"PPA|CAPEX|Lease|null","currency":"usd|local|mixed|unknown","summary":"2-3 plain English sentences","green_flags":["..."],"red_flags":["..."],"ipp":["CrossBoundary Energy","Infinity Power","SAWA Energy","Husk Power"],"next_action":"specific first step for Solarity","factors":{"load":{"score":integer,"max":30,"why":"string"},"grid":{"score":integer,"max":20,"why":"string"},"currency":{"score":integer,"max":15,"why":"string"},"credit":{"score":integer,"max":15,"why":"string"},"diesel":{"score":integer,"max":10,"why":"string"},"access":{"score":integer,"max":10,"why":"string"}}}`;
};

const CLAUDE_ENRICH_PROMPT = (co, country) => {
  const cLabel = COUNTRIES.find(c=>c.value===country)?.label||country;
  return `You are a specialist in African B2B contact research. Find REAL named decision-makers at this company.

Company: ${co.name}
Country: ${cLabel}
Sector: ${co.sector||"unknown"}
City: ${co.city||"unknown"}
Website: ${co.website||"none"}
Description: ${co.description||"unknown"}

Search these sources in order:
1. LinkedIn: search "${co.name}" ${cLabel} Managing Director CEO CFO
2. Company website team/about/management page
3. Google: "${co.name}" ${cLabel} CEO OR "Managing Director" contact
4. Local news sources
5. Industry associations (ZAM, UMA, AGI, KAM etc)
6. Facebook Business page (often shows owner/manager name)
7. Business registry (PACRA/URSB/BRELA/ORC -- director names)

Find MD/CEO first (financial approver), then Plant/Operations Manager (technical champion).

Return ONLY valid JSON (no markdown):
{"contacts":[{"name":"string or null","title":"string or null","role":"financial_approver|technical_champion|both|unknown","email":"string or null","email_conf":"confirmed|high|medium|low|unverified","mobile":"string or null","mobile_conf":"confirmed|high|medium|low|unverified","whatsapp":true_or_false_or_null,"linkedin":"url or null","channel":"whatsapp|email|linkedin|phone","source":"where found","tip":"specific Solarity outreach tip"}],"notes":"search approach and quality notes"}

Rules: max 3 contacts, always flag WhatsApp when mobile found (African B2B context).`;
};

// ── API CALLS ─────────────────────────────────────────────────────────────────

async function geminiDiscover(apiKey, country, sectors, geo, minLoad) {
  const prompt = GEMINI_DISCOVER_PROMPT(country, sectors, geo, minLoad);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ google_search: {} }],
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  let text = data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  text = text.trim();
  if (text.includes("```json")) text = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) text = text.split("```")[1].split("```")[0].trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]).filter(c=>c.name?.length>2).slice(0,10); } catch { return []; }
}

async function claudeQualify(anthropicKey, co, country, minLoad) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: CLAUDE_QUALIFY_PROMPT(co, country, minLoad) }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || `Claude API error ${res.status}`);
  }
  const data = await res.json();
  let text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
  if (text.includes("```json")) text = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) text = text.split("```")[1].split("```")[0].trim();
  return JSON.parse(text);
}

async function claudeEnrich(anthropicKey, co, country) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: CLAUDE_ENRICH_PROMPT(co, country) }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || `Claude API error ${res.status}`);
  }
  const data = await res.json();
  let text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
  if (text.includes("```json")) text = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) text = text.split("```")[1].split("```")[0].trim();
  return JSON.parse(text);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

const fmtCapex = (min,max) => {
  if (!min||!max) return null;
  const f = n => n>=1e6?`$${(n/1e6).toFixed(1)}M`:n>=1e3?`$${(n/1e3).toFixed(0)}K`:`$${n}`;
  return `${f(min)} - ${f(max)}`;
};

const timeStr = () => new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

// ── SMALL UI PIECES ───────────────────────────────────────────────────────────

function ScoreRing({ score, tier, size=52 }) {
  const t = TIERS[tier]||TIERS.cool;
  const r = size/2-4;
  const circ = 2*Math.PI*r;
  const offset = circ-(Math.min(100,score)/100)*circ;
  return (
    <svg width={size} height={size} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:"stroke-dashoffset 1s ease", filter:`drop-shadow(0 0 5px ${t.color}80)`}}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={t.color} fontSize={14} fontWeight="800" fontFamily="'JetBrains Mono',monospace">
        {score}
      </text>
    </svg>
  );
}

function Pill({ label, color, bg, border }) {
  return (
    <span style={{
      display:"inline-block", fontSize:9, fontWeight:700, letterSpacing:"0.1em",
      padding:"2px 8px", borderRadius:3, textTransform:"uppercase",
      color, background:bg||`${color}18`, border:`1px solid ${border||color+"40"}`,
      whiteSpace:"nowrap",
    }}>{label}</span>
  );
}

function ConfPill({ level }) {
  const map = {
    confirmed:  {c:"#22C55E",bg:"rgba(34,197,94,0.12)"},
    high:       {c:"#4ADE80",bg:"rgba(74,222,128,0.10)"},
    medium:     {c:"#F0A500",bg:"rgba(240,165,0,0.12)"},
    low:        {c:"#F87171",bg:"rgba(248,113,113,0.10)"},
    unverified: {c:"#4A5568",bg:"rgba(74,85,104,0.15)"},
  };
  const s = map[level]||map.unverified;
  return <Pill label={level} color={s.c} bg={s.bg}/>;
}

function MiniBar({ value, max }) {
  const pct = Math.min(100,(value/max)*100);
  const c = pct>=75?"#22C55E":pct>=50?"#F0A500":pct>=25?"#38BDF8":"#EF4444";
  return (
    <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
      <div style={{width:`${pct}%`,height:"100%",background:c,transition:"width 0.8s ease"}}/>
    </div>
  );
}

// ── CONTACT CARD ──────────────────────────────────────────────────────────────

function ContactCard({ c }) {
  const roles = {
    financial_approver: {label:"Financial Approver", color:"#F0A500"},
    technical_champion: {label:"Technical Champion", color:"#38BDF8"},
    both:               {label:"FA + TC",            color:"#A78BFA"},
    unknown:            {label:"Unknown",             color:"#4A5568"},
  };
  const channels = {email:"✉",whatsapp:"💬",linkedin:"🔗",phone:"☎"};
  const role = roles[c.role]||roles.unknown;
  return (
    <div style={{background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"14px",marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:"#E2E8F0",marginBottom:2}}>
            {c.name||<em style={{color:"#4A5568"}}>Name not found</em>}
          </div>
          <div style={{fontSize:11,color:"#64748B"}}>{c.title||"Title unknown"}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
          <Pill label={role.label} color={role.color}/>
          {c.channel&&<Pill label={`${channels[c.channel]||""} ${c.channel}`} color="#22C55E"/>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:c.tip?10:0}}>
        {c.email&&(
          <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:"#334155",letterSpacing:"0.1em",marginBottom:3}}>EMAIL</div>
            <div style={{color:"#7BA5C8",wordBreak:"break-all",fontSize:11,marginBottom:4}}>{c.email}</div>
            <ConfPill level={c.email_conf}/>
          </div>
        )}
        {c.mobile&&(
          <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:"#334155",letterSpacing:"0.1em",marginBottom:3}}>{c.whatsapp?"WHATSAPP":"MOBILE"}</div>
            <div style={{color:"#7BA5C8",fontSize:11,marginBottom:4}}>{c.mobile}</div>
            <ConfPill level={c.mobile_conf}/>
          </div>
        )}
        {c.linkedin&&(
          <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px",gridColumn:"1/-1"}}>
            <div style={{fontSize:9,color:"#334155",letterSpacing:"0.1em",marginBottom:3}}>LINKEDIN</div>
            <a href={c.linkedin} target="_blank" rel="noreferrer" style={{color:"#38BDF8",fontSize:11,textDecoration:"none"}}>
              {c.linkedin.replace(/https?:\/\/(www\.)?/,"")}
            </a>
          </div>
        )}
      </div>
      {c.tip&&(
        <div style={{fontSize:11,color:"#64748B",lineHeight:1.6,fontStyle:"italic",paddingTop:8,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <span style={{color:"#F0A50060",fontStyle:"normal"}}>💡 </span>{c.tip}
        </div>
      )}
      {c.source&&<div style={{fontSize:9,color:"#1E293B",marginTop:5,letterSpacing:"0.05em"}}>Source: {c.source}</div>}
    </div>
  );
}

// ── PROSPECT CARD ─────────────────────────────────────────────────────────────

function ProspectCard({ p, idx, onEnrich }) {
  const [open, setOpen] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  const q = p.qual||{};
  const t = TIERS[q.tier]||TIERS.cool;
  const capex = fmtCapex(q.capex_min, q.capex_max);

  return (
    <div style={{
      background: open?"rgba(240,165,0,0.02)":"rgba(255,255,255,0.01)",
      border:`1px solid ${open?t.border:"rgba(255,255,255,0.06)"}`,
      borderRadius:12, marginBottom:8, overflow:"hidden",
      boxShadow: open?`0 0 20px ${t.color}08`:"none",
      transition:"all 0.2s",
    }}>
      {/* Header row */}
      <div onClick={()=>setOpen(v=>!v)} style={{
        display:"grid", gridTemplateColumns:"36px 56px 1fr auto",
        alignItems:"center", gap:14, padding:"14px 18px", cursor:"pointer",
      }}>
        <div style={{fontSize:11,color:"#1E293B",fontWeight:700,textAlign:"center"}}>
          {String(idx+1).padStart(2,"0")}
        </div>
        <ScoreRing score={q.score||0} tier={q.tier||"cool"} size={50}/>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:15,fontWeight:700,color:"#E2E8F0"}}>{p.co.name}</span>
            <span style={{
              fontSize:9,fontWeight:800,letterSpacing:"0.12em",padding:"3px 9px",
              borderRadius:3,background:t.bg,color:t.color,border:`1px solid ${t.border}`,
            }}>{t.label}</span>
            {p.contacts?.length>0&&(
              <Pill label={`${p.contacts.length} contact${p.contacts.length>1?"s":""}`} color="#22C55E"/>
            )}
            {p.enriching&&(
              <Pill label="searching..." color="#F0A500"/>
            )}
          </div>
          <div style={{fontSize:11,color:"#475569"}}>
            {p.co.city}{p.co.region?` · ${p.co.region}`:""} · {(p.co.sector||"").replace(/_/g," ")}
          </div>
          <div style={{display:"flex",gap:16,marginTop:5,flexWrap:"wrap"}}>
            {q.load_kwp&&(
              <span style={{fontSize:11,color:"#475569"}}>
                ⚡ <span style={{color:"#94A3B8"}}>
                  {q.load_kwp>=1000?`${(q.load_kwp/1000).toFixed(1)} MWp`:`${q.load_kwp} kWp`}
                </span>
              </span>
            )}
            {capex&&<span style={{fontSize:11,color:"#475569"}}>💰 <span style={{color:"#94A3B8"}}>{capex}</span></span>}
            {q.structure&&<span style={{fontSize:11,color:"#475569"}}>📋 <span style={{color:"#94A3B8"}}>{q.structure}</span></span>}
            {q.currency&&q.currency!=="unknown"&&(
              <span style={{fontSize:11,color:"#475569"}}>
                💵 <span style={{color:q.currency==="usd"?"#22C55E":"#94A3B8"}}>{q.currency.toUpperCase()}</span>
              </span>
            )}
          </div>
        </div>
        <span style={{color:"#334155",fontSize:14,transition:"transform 0.2s",transform:open?"rotate(180deg)":"none"}}>▾</span>
      </div>

      {/* Expanded */}
      {open&&(
        <div style={{padding:"0 18px 18px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20}}>

            {/* Left */}
            <div>
              {q.summary&&(
                <div style={{
                  margin:"16px 0",padding:"12px 14px",fontSize:13,color:"#94A3B8",lineHeight:1.7,
                  background:`${t.color}08`,borderLeft:`3px solid ${t.color}50`,borderRadius:"0 8px 8px 0",
                }}>
                  {q.summary}
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                {q.green_flags?.length>0&&(
                  <div>
                    <div style={{fontSize:9,color:"#22C55E60",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Green Flags</div>
                    {q.green_flags.map((f,i)=>(
                      <div key={i} style={{fontSize:11,color:"#22C55E",marginBottom:5,display:"flex",gap:6}}>
                        <span>+</span><span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
                {q.red_flags?.length>0&&(
                  <div>
                    <div style={{fontSize:9,color:"#EF444460",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Red Flags</div>
                    {q.red_flags.map((f,i)=>(
                      <div key={i} style={{fontSize:11,color:"#EF4444",marginBottom:5,display:"flex",gap:6}}>
                        <span>-</span><span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={()=>setShowFactors(v=>!v)} style={{
                background:"none",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,
                padding:"6px 14px",cursor:"pointer",fontSize:10,color:"#4A5568",
                letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:showFactors?14:0,
              }}>
                {showFactors?"▾ Hide":"▸ Show"} Score Breakdown
              </button>

              {showFactors&&q.factors&&(
                <div style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"14px",marginBottom:14}}>
                  {Object.entries(q.factors).map(([k,v])=>(
                    <div key={k} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:9,color:"#334155",textTransform:"uppercase",letterSpacing:"0.1em"}}>{k}</span>
                        <span style={{fontSize:10,color:"#7BA5C8",fontWeight:700}}>{v.score}/{v.max}</span>
                      </div>
                      <MiniBar value={v.score} max={v.max}/>
                      {v.why&&<div style={{fontSize:10,color:"#334155",marginTop:3,lineHeight:1.5}}>{v.why}</div>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {q.ipp?.length>0&&(
                  <div style={{background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:9,color:"#334155",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Recommended IPP</div>
                    {q.ipp.map((x,i)=><div key={i} style={{fontSize:11,color:"#38BDF8",marginBottom:3}}>→ {x}</div>)}
                  </div>
                )}
                {q.next_action&&(
                  <div style={{background:"rgba(240,165,0,0.05)",borderRadius:8,padding:"10px 12px",border:"1px solid rgba(240,165,0,0.12)"}}>
                    <div style={{fontSize:9,color:"#F0A50060",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Next Action</div>
                    <div style={{fontSize:11,color:"#F0A500",lineHeight:1.6}}>{q.next_action}</div>
                  </div>
                )}
              </div>

              {(p.co.website||p.co.phone||p.co.description)&&(
                <div style={{marginTop:12,background:"rgba(0,0,0,0.15)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:"#334155",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Company Info</div>
                  {p.co.website&&<div style={{fontSize:11,marginBottom:4}}>🌐 <a href={p.co.website.startsWith("http")?p.co.website:`https://${p.co.website}`} target="_blank" rel="noreferrer" style={{color:"#38BDF8",textDecoration:"none"}}>{p.co.website}</a></div>}
                  {p.co.phone&&<div style={{fontSize:11,color:"#7BA5C8",marginBottom:4}}>☎ {p.co.phone}</div>}
                  {p.co.description&&<div style={{fontSize:11,color:"#475569",lineHeight:1.6,marginTop:6}}>{p.co.description}</div>}
                </div>
              )}
            </div>

            {/* Right -- contacts */}
            <div style={{paddingTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,color:"#334155",letterSpacing:"0.12em",textTransform:"uppercase"}}>
                  Decision-Makers
                </div>
                {!p.enriching&&!p.contacts?.length&&(q.tier==="hot"||q.tier==="warm")&&(
                  <button onClick={()=>onEnrich(p)} style={{
                    background:"rgba(240,165,0,0.1)",border:"1px solid rgba(240,165,0,0.3)",
                    borderRadius:6,padding:"5px 12px",cursor:"pointer",
                    fontSize:10,color:"#F0A500",fontWeight:600,letterSpacing:"0.06em",
                  }}>🔍 Find Contacts</button>
                )}
              </div>

              {p.enriching&&(
                <div style={{padding:"20px",textAlign:"center",background:"rgba(240,165,0,0.04)",border:"1px solid rgba(240,165,0,0.1)",borderRadius:8}}>
                  <div className="pulse" style={{fontSize:14,color:"#F0A500",marginBottom:6}}>◉</div>
                  <div style={{fontSize:11,color:"#F0A500",marginBottom:4}}>Searching...</div>
                  <div style={{fontSize:9,color:"#334155",letterSpacing:"0.08em"}}>LINKEDIN · WEBSITE · NEWS · REGISTRY · FACEBOOK</div>
                </div>
              )}

              {p.contacts?.map((c,i)=><ContactCard key={i} c={c}/>)}

              {p.enrichNotes&&!p.enriching&&(
                <div style={{fontSize:10,color:"#334155",fontStyle:"italic",lineHeight:1.5}}>{p.enrichNotes}</div>
              )}

              {!p.enriching&&!p.contacts?.length&&q.tier!=="hot"&&q.tier!=="warm"&&(
                <div style={{fontSize:11,color:"#1E293B",padding:"10px 0"}}>
                  Contact enrichment is available for Hot and Warm prospects.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PIPELINE LOG ──────────────────────────────────────────────────────────────

function PipelineLog({ entries }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current) ref.current.scrollTop=ref.current.scrollHeight; },[entries]);
  return (
    <div ref={ref} style={{
      height:160,overflowY:"auto",background:"rgba(0,0,0,0.3)",borderRadius:8,
      padding:"10px 14px",fontFamily:"'JetBrains Mono',monospace",fontSize:11,
    }}>
      {entries.length===0&&<div style={{color:"#1E293B"}}>▸ Awaiting pipeline start...</div>}
      {entries.map((e,i)=>(
        <div key={i} style={{marginBottom:3,color:e.t==="ok"?"#22C55E":e.t==="err"?"#EF4444":e.t==="info"?"#38BDF8":"#475569"}}>
          <span style={{color:"#1E293B"}}>{e.ts}  </span>
          {e.t==="ok"?"✓":e.t==="err"?"✗":e.t==="info"?"›":"·"} {e.msg}
        </div>
      ))}
    </div>
  );
}

// ── SETUP SCREEN ──────────────────────────────────────────────────────────────

function SetupScreen({ onSave }) {
  const [gemKey, setGemKey] = useState("");
  const [antKey, setAntKey] = useState("");
  const [showGem, setShowGem] = useState(false);
  const [showAnt, setShowAnt] = useState(false);
  const [testing, setTesting] = useState({ gemini: null, claude: null }); // null | "loading" | "ok" | string(error)

  async function testGemini() {
    if (!gemKey.trim()) return;
    setTesting(p => ({...p, gemini: "loading"}));
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gemKey.trim()}`,
        {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({contents:[{role:"user",parts:[{text:"Reply with just the word: CONNECTED"}]}]}),
        }
      );
      if (res.ok) {
        setTesting(p => ({...p, gemini: "ok"}));
      } else {
        const d = await res.json().catch(()=>({}));
        setTesting(p => ({...p, gemini: d?.error?.message||"Invalid API key"}));
      }
    } catch(e) {
      setTesting(p => ({...p, gemini: "Connection error - check key and try again"}));
    }
  }

  async function testClaude() {
    if (!antKey.trim()) return;
    setTesting(p => ({...p, claude: "loading"}));
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key": antKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:50,
          messages:[{role:"user",content:"Reply with just the word: CONNECTED"}],
        }),
      });
      if (res.ok) {
        setTesting(p => ({...p, claude: "ok"}));
      } else {
        const d = await res.json().catch(()=>({}));
        setTesting(p => ({...p, claude: d?.error?.message||"Invalid API key"}));
      }
    } catch(e) {
      setTesting(p => ({...p, claude: "Connection error - check key and try again"}));
    }
  }

  const bothReady = gemKey.trim() && antKey.trim();
  const bothVerified = testing.gemini === "ok" && testing.claude === "ok";

  const inputStyle = (result) => ({
    width:"100%",background:"rgba(0,0,0,0.3)",
    border:`1px solid ${result==="ok"?"rgba(34,197,94,0.4)":result&&result!=="ok"&&result!=="loading"?"rgba(239,68,68,0.4)":"rgba(255,255,255,0.08)"}`,
    borderRadius:8,padding:"12px 44px 12px 14px",
    color:"#E2E8F0",fontSize:13,fontFamily:"'JetBrains Mono',monospace",
    outline:"none",transition:"border-color 0.2s",
  });

  const resultMsg = (result) => {
    if (!result || result === "loading") return null;
    return (
      <div style={{
        marginTop:8,fontSize:11,
        color:result==="ok"?"#22C55E":"#EF4444",
        display:"flex",alignItems:"center",gap:6,
      }}>
        {result==="ok"?"✓ Connected successfully":"✗ "+result}
      </div>
    );
  };

  return (
    <div style={{
      minHeight:"100vh",background:"linear-gradient(135deg,#070B12 0%,#0D1520 100%)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'JetBrains Mono',monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}.pulse{animation:pulse 1.4s ease-in-out infinite;}
        @keyframes glow{0%,100%{opacity:0.4}50%{opacity:0.8}}.glow{animation:glow 3s ease-in-out infinite;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-thumb{background:#1E2D3D;border-radius:2px;}
      `}</style>

      {/* Background grid */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        <div style={{
          position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          width:600,height:600,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(240,165,0,0.04) 0%,transparent 70%)",
        }}/>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.03}}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#F0A500" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>
      </div>

      <div style={{width:"100%",maxWidth:500,padding:"0 20px",position:"relative",zIndex:1}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{
            width:64,height:64,borderRadius:"50%",margin:"0 auto 20px",
            background:"rgba(240,165,0,0.1)",border:"1px solid rgba(240,165,0,0.2)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,
          }} className="glow">☀️</div>
          <div style={{
            fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,
            background:"linear-gradient(135deg,#E2E8F0 0%,#F0A500 60%,#FF5C20 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            marginBottom:8,lineHeight:1.1,
          }}>Solarity Africa</div>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:13,color:"#F0A50080",letterSpacing:"0.2em",textTransform:"uppercase"}}>
            Solar Origination Agent
          </div>
          <div style={{fontSize:11,color:"#334155",marginTop:10}}>
            Discovery · Qualification · Contact Enrichment
          </div>
        </div>

        {/* Keys card */}
        <div style={{
          background:"rgba(13,21,32,0.8)",backdropFilter:"blur(20px)",
          border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"32px",
        }}>
          {/* Gemini Key */}
          <div style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:testing.gemini==="ok"?"#22C55E":"#F0A500"}}/>
              <div style={{fontSize:11,color:"#F0A500",letterSpacing:"0.12em",textTransform:"uppercase"}}>
                Gemini API Key
              </div>
            </div>
            <div style={{fontSize:10,color:"#475569",lineHeight:1.6,marginBottom:10}}>
              Discovery engine with Google Search grounding.{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{color:"#38BDF8",textDecoration:"none"}}>Get key →</a>
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{position:"relative",flex:1}}>
                <input
                  type={showGem?"text":"password"}
                  value={gemKey}
                  onChange={e=>{ setGemKey(e.target.value); setTesting(p=>({...p,gemini:null})); }}
                  placeholder="AIza..."
                  style={inputStyle(testing.gemini)}
                />
                <button onClick={()=>setShowGem(v=>!v)} style={{
                  position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",cursor:"pointer",color:"#475569",fontSize:14,
                }}>{showGem?"🙈":"👁"}</button>
              </div>
              <button onClick={testGemini} disabled={!gemKey.trim()||testing.gemini==="loading"}
                style={{
                  padding:"0 16px",borderRadius:8,cursor:!gemKey.trim()||testing.gemini==="loading"?"default":"pointer",
                  background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
                  color:!gemKey.trim()?"#1E293B":"#7BA5C8",fontSize:10,fontWeight:600,letterSpacing:"0.06em",
                  whiteSpace:"nowrap",
                }}>
                {testing.gemini==="loading"?<span className="pulse">...</span>:"TEST"}
              </button>
            </div>
            {resultMsg(testing.gemini)}
          </div>

          {/* Claude Key */}
          <div style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:testing.claude==="ok"?"#22C55E":"#38BDF8"}}/>
              <div style={{fontSize:11,color:"#38BDF8",letterSpacing:"0.12em",textTransform:"uppercase"}}>
                Anthropic API Key
              </div>
            </div>
            <div style={{fontSize:10,color:"#475569",lineHeight:1.6,marginBottom:10}}>
              Qualification scoring and contact enrichment.{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{color:"#38BDF8",textDecoration:"none"}}>Get key →</a>
            </div>
            <div style={{display:"flex",gap:8}}>
              <div style={{position:"relative",flex:1}}>
                <input
                  type={showAnt?"text":"password"}
                  value={antKey}
                  onChange={e=>{ setAntKey(e.target.value); setTesting(p=>({...p,claude:null})); }}
                  placeholder="sk-ant-..."
                  style={inputStyle(testing.claude)}
                />
                <button onClick={()=>setShowAnt(v=>!v)} style={{
                  position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",cursor:"pointer",color:"#475569",fontSize:14,
                }}>{showAnt?"🙈":"👁"}</button>
              </div>
              <button onClick={testClaude} disabled={!antKey.trim()||testing.claude==="loading"}
                style={{
                  padding:"0 16px",borderRadius:8,cursor:!antKey.trim()||testing.claude==="loading"?"default":"pointer",
                  background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
                  color:!antKey.trim()?"#1E293B":"#7BA5C8",fontSize:10,fontWeight:600,letterSpacing:"0.06em",
                  whiteSpace:"nowrap",
                }}>
                {testing.claude==="loading"?<span className="pulse">...</span>:"TEST"}
              </button>
            </div>
            {resultMsg(testing.claude)}
          </div>

          {/* Launch */}
          <button
            onClick={()=>{ if(bothReady) onSave(gemKey.trim(), antKey.trim()); }}
            disabled={!bothReady}
            style={{
              width:"100%",padding:"13px",borderRadius:8,cursor:bothReady?"pointer":"default",
              background:bothReady?"linear-gradient(135deg,#F0A500 0%,#D4601A 100%)":"rgba(255,255,255,0.03)",
              border:"none",color:bothReady?"#070B12":"#1E293B",
              fontSize:12,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,
              letterSpacing:"0.1em",textTransform:"uppercase",
              boxShadow:bothReady?"0 4px 20px rgba(240,165,0,0.25)":"none",
              transition:"all 0.2s",opacity:bothReady?1:0.4,
            }}>
            ⚡ Launch Agent
          </button>

          {bothReady && !bothVerified && (
            <div style={{textAlign:"center",marginTop:10,fontSize:10,color:"#F0A50060"}}>
              Tip: test both keys before launching to avoid errors mid-pipeline
            </div>
          )}

          <div style={{marginTop:20,padding:"12px",background:"rgba(0,0,0,0.2)",borderRadius:8}}>
            <div style={{fontSize:9,color:"#334155",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>How it works</div>
            <div style={{fontSize:10,color:"#475569",lineHeight:1.7}}>
              <span style={{color:"#F0A500"}}>① Gemini</span> uses Google Search to discover real companies<br/>
              <span style={{color:"#38BDF8"}}>② Claude</span> scores each company across 6 solar criteria<br/>
              <span style={{color:"#22C55E"}}>③ Claude</span> finds decision-maker contacts for Hot + Warm prospects
            </div>
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:16,fontSize:10,color:"#1E293B"}}>
          API keys are used only in this browser session and never stored server-side.
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function SolarityAgent() {
  const [keys, setKeys] = useState({ gemini: null, anthropic: null });
  const [cfg, setCfg] = useState({
    country:"zambia", sectors:["mining","manufacturing"],
    geo:"", minLoad:200, autoEnrich:true,
  });
  const [screen, setScreen] = useState("config");
  const [prospects, setProspects] = useState([]);
  const [logEntries, setLogEntries] = useState([]);
  const [progress, setProgress] = useState({phase:"",cur:0,tot:0});
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState("results");
  const running = screen === "running";

  const log = useCallback((msg, t="def") => {
    setLogEntries(p=>[...p,{msg,t,ts:timeStr()}]);
  },[]);

  if (!keys.gemini || !keys.anthropic) {
    return <SetupScreen onSave={(g,a)=>setKeys({gemini:g,anthropic:a})}/>;
  }

  async function runPipeline() {
    setScreen("running");
    setProspects([]);
    setLogEntries([]);
    setStats(null);
    setFilter("all");
    setTab("log");
    setProgress({phase:"discovery",cur:0,tot:0});

    try {
      log(`Discovery: ${COUNTRIES.find(c=>c.value===cfg.country)?.label} · ${cfg.sectors.join(", ")}${cfg.geo?` · ${cfg.geo}`:""}`, "info");
      log("Gemini searching with Google grounding...", "info");

      let companies = [];
      try {
        companies = await geminiDiscover(keys.gemini, cfg.country, cfg.sectors, cfg.geo, cfg.minLoad);
        log(`✓ ${companies.length} candidates discovered`, "ok");
      } catch(e) {
        log(`Discovery error: ${e.message}`, "err");
        if (e.message.includes("400")||e.message.includes("API_KEY")) {
          log("Check your Gemini API key - it may be invalid or expired", "err");
          setScreen("results");
          return;
        }
      }

      if (!companies.length) {
        log("No candidates found - try different sectors or location", "err");
        setScreen("results");
        return;
      }

      setProgress({phase:"qualification",cur:0,tot:companies.length});
      log(`Qualifying ${companies.length} candidates with Claude...`, "info");

      const pList = [];
      let hot=0,warm=0,cool=0,disq=0;

      for (let i=0; i<companies.length; i++) {
        const co = companies[i];
        setProgress(p=>({...p,cur:i+1}));
        log(`Qualifying: ${co.name}`);
        try {
          const q = await claudeQualify(keys.anthropic, co, cfg.country, cfg.minLoad);
          pList.push({co, qual:q, contacts:[], enriching:false});
          if      (q.tier==="hot")  { hot++;  log(`${co.name} → HOT (${q.score})`,  "ok"); }
          else if (q.tier==="warm") { warm++; log(`${co.name} → WARM (${q.score})`, "ok"); }
          else if (q.tier==="cool") { cool++; log(`${co.name} → COOL (${q.score})`); }
          else                      { disq++; log(`${co.name} → DISQ (${q.score})`); }
          setProspects([...pList].sort((a,b)=>b.qual.score-a.qual.score));
        } catch(e) { log(`Failed: ${co.name} - ${e.message}`, "err"); }
      }

      const sorted = [...pList].sort((a,b)=>b.qual.score-a.qual.score);
      setProspects(sorted);
      setStats({total:pList.length,hot,warm,cool,disq});
      log(`✓ Qualification complete - HOT:${hot}  WARM:${warm}  COOL:${cool}  DISQ:${disq}`, "ok");

      if (cfg.autoEnrich) {
        const toEnrich = sorted.filter(p=>p.qual.tier==="hot"||p.qual.tier==="warm");
        if (toEnrich.length) {
          setProgress({phase:"enrichment",cur:0,tot:toEnrich.length});
          log(`Enriching contacts for ${toEnrich.length} Hot + Warm prospects...`, "info");
          for (let i=0; i<toEnrich.length; i++) {
            const pr = toEnrich[i];
            setProgress(p=>({...p,cur:i+1}));
            log(`Enriching: ${pr.co.name}`);
            setProspects(prev=>prev.map(x=>x.co.name===pr.co.name?{...x,enriching:true}:x));
            try {
              const r = await claudeEnrich(keys.anthropic, pr.co, cfg.country);
              const contacts = r.contacts||[];
              log(`${pr.co.name} → ${contacts.length} contact(s)`, contacts.length?"ok":"def");
              setProspects(prev=>prev.map(x=>x.co.name===pr.co.name?{...x,contacts,enrichNotes:r.notes,enriching:false}:x));
            } catch(e) {
              log(`Enrich failed: ${pr.co.name}`, "err");
              setProspects(prev=>prev.map(x=>x.co.name===pr.co.name?{...x,enriching:false}:x));
            }
          }
          log("✓ Contact enrichment complete", "ok");
        }
      }

      log("Pipeline complete ✓", "ok");
      setTab("results");
    } catch(e) { log(`Pipeline error: ${e.message}`, "err"); }

    setScreen("results");
  }

  async function manualEnrich(prospect) {
    setProspects(prev=>prev.map(x=>x.co.name===prospect.co.name?{...x,enriching:true}:x));
    log(`Manual enrichment: ${prospect.co.name}`, "info");
    try {
      const r = await claudeEnrich(keys.anthropic, prospect.co, cfg.country);
      const contacts = r.contacts||[];
      log(`${prospect.co.name} → ${contacts.length} contact(s)`, contacts.length?"ok":"def");
      setProspects(prev=>prev.map(x=>x.co.name===prospect.co.name?{...x,contacts,enrichNotes:r.notes,enriching:false}:x));
    } catch(e) {
      log(`Enrichment failed: ${e.message}`, "err");
      setProspects(prev=>prev.map(x=>x.co.name===prospect.co.name?{...x,enriching:false}:x));
    }
  }

  function doExport() {
    const out = {
      generated:new Date().toISOString(), config:cfg, stats,
      prospects:prospects.map(p=>({
        name:p.co.name, city:p.co.city, sector:p.co.sector,
        score:p.qual?.score, tier:p.qual?.tier,
        load_kwp:p.qual?.load_kwp, capex:fmtCapex(p.qual?.capex_min,p.qual?.capex_max),
        structure:p.qual?.structure, currency:p.qual?.currency,
        summary:p.qual?.summary, green_flags:p.qual?.green_flags,
        red_flags:p.qual?.red_flags, ipp:p.qual?.ipp,
        next_action:p.qual?.next_action,
        website:p.co.website, phone:p.co.phone,
        contacts:p.contacts,
      })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:"application/json"}));
    a.download = `solarity_${cfg.country}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  }

  const countryD = COUNTRIES.find(c=>c.value===cfg.country);
  const filtered = filter==="all"?prospects:prospects.filter(p=>p.qual?.tier===filter);

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:4px;height:4px;}
    ::-webkit-scrollbar-thumb{background:#1E2D3D;border-radius:2px;}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}.pulse{animation:pulse 1.3s ease-in-out infinite;}
    @keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 0.9s linear infinite;display:inline-block;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.fu{animation:fadeUp 0.3s ease forwards;}
    input,button{font-family:'JetBrains Mono',monospace;}
  `;

  return (
    <div style={{display:"flex",height:"100vh",background:"#080D14",fontFamily:"'JetBrains Mono',monospace",color:"#E2E8F0",overflow:"hidden"}}>
      <style>{CSS}</style>

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <div style={{
        width:220,flexShrink:0,background:"#060A10",
        borderRight:"1px solid rgba(255,255,255,0.06)",
        display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",
      }}>
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{fontSize:8,color:"#F0A50050",letterSpacing:"0.3em",textTransform:"uppercase",marginBottom:6}}>
            SOLARITY AFRICA
          </div>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,lineHeight:1.1,
            background:"linear-gradient(135deg,#E2E8F0 0%,#F0A500 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            Origination<br/>Agent
          </div>
        </div>

        {stats&&(
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <div style={{fontSize:8,color:"#1E293B",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Pipeline</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
              {[{l:"TOTAL",v:stats.total,c:"#CBD5E1"},{l:"HOT",v:stats.hot,c:"#FF4B4B"},{l:"WARM",v:stats.warm,c:"#F0A500"},{l:"COOL",v:stats.cool,c:"#38BDF8"}].map(s=>(
                <div key={s.l} style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"7px 8px"}}>
                  <div style={{fontSize:18,fontWeight:700,color:s.c,lineHeight:1,fontFamily:"'Syne',sans-serif"}}>{s.v}</div>
                  <div style={{fontSize:7,color:"#1E293B",letterSpacing:"0.12em",marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:8,color:"#1E293B",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Country</div>
            {COUNTRIES.map(c=>(
              <button key={c.value} onClick={()=>!running&&setCfg(p=>({...p,country:c.value,geo:""}))}
                disabled={running}
                style={{
                  display:"flex",alignItems:"center",gap:7,width:"100%",
                  padding:"5px 8px",borderRadius:5,cursor:running?"default":"pointer",
                  background:cfg.country===c.value?"rgba(240,165,0,0.1)":"transparent",
                  border:cfg.country===c.value?"1px solid rgba(240,165,0,0.3)":"1px solid transparent",
                  color:cfg.country===c.value?"#F0A500":"#3D4F63",
                  fontSize:11,marginBottom:1,textAlign:"left",
                  opacity:running&&cfg.country!==c.value?0.25:1,
                  transition:"all 0.15s",
                }}>
                <span>{c.flag}</span>
                <span style={{fontWeight:cfg.country===c.value?600:400}}>{c.label}</span>
              </button>
            ))}
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:8,color:"#1E293B",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Region</div>
            {["",...(countryD?.cities||[])].map(city=>(
              <button key={city||"all"} onClick={()=>!running&&setCfg(p=>({...p,geo:city}))}
                disabled={running}
                style={{
                  display:"block",width:"100%",padding:"4px 8px",borderRadius:5,
                  cursor:running?"default":"pointer",textAlign:"left",fontSize:10,
                  background:cfg.geo===city?"rgba(240,165,0,0.08)":"transparent",
                  border:cfg.geo===city?"1px solid rgba(240,165,0,0.2)":"1px solid transparent",
                  color:cfg.geo===city?"#F0A500":"#2D3F52",marginBottom:1,
                  opacity:running&&cfg.geo!==city?0.25:1,
                }}>
                {city||"All regions"}
              </button>
            ))}
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:8,color:"#1E293B",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Min Load</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {[100,200,500,1000].map(v=>(
                <button key={v} onClick={()=>!running&&setCfg(p=>({...p,minLoad:v}))}
                  disabled={running}
                  style={{
                    padding:"6px 4px",borderRadius:5,cursor:running?"default":"pointer",fontSize:10,textAlign:"center",
                    background:cfg.minLoad===v?"rgba(240,165,0,0.12)":"rgba(255,255,255,0.02)",
                    border:cfg.minLoad===v?"1px solid rgba(240,165,0,0.35)":"1px solid rgba(255,255,255,0.05)",
                    color:cfg.minLoad===v?"#F0A500":"#2D3F52",
                  }}>
                  {v>=1000?"1 MWp":`${v} kWp`}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:8,color:"#1E293B",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>Auto-Enrich Contacts</div>
            <button onClick={()=>!running&&setCfg(p=>({...p,autoEnrich:!p.autoEnrich}))}
              disabled={running}
              style={{
                width:"100%",padding:"7px",borderRadius:6,cursor:running?"default":"pointer",fontSize:10,
                background:cfg.autoEnrich?"rgba(34,197,94,0.08)":"rgba(255,255,255,0.02)",
                border:cfg.autoEnrich?"1px solid rgba(34,197,94,0.25)":"1px solid rgba(255,255,255,0.05)",
                color:cfg.autoEnrich?"#22C55E":"#2D3F52",fontWeight:cfg.autoEnrich?600:400,
              }}>
              {cfg.autoEnrich?"✓ Hot + Warm":"Disabled"}
            </button>
          </div>
        </div>

        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <button onClick={runPipeline} disabled={running||cfg.sectors.length===0}
            style={{
              width:"100%",padding:"12px",borderRadius:8,
              cursor:running||cfg.sectors.length===0?"default":"pointer",
              background:running?"rgba(240,165,0,0.06)":cfg.sectors.length===0?"rgba(255,255,255,0.03)":"linear-gradient(135deg,#F0A500 0%,#D4601A 100%)",
              border:running?"1px solid rgba(240,165,0,0.15)":"none",
              color:running?"#F0A50060":cfg.sectors.length===0?"#1E293B":"#070B12",
              fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",
              boxShadow:running||cfg.sectors.length===0?"none":"0 4px 16px rgba(240,165,0,0.22)",
              transition:"all 0.2s",
            }}>
            {running?(
              <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <span className="spin" style={{fontSize:11}}>◌</span>RUNNING
              </span>
            ):"⚡ Run Pipeline"}
          </button>
          {cfg.sectors.length===0&&(
            <div style={{fontSize:9,color:"#EF4444",textAlign:"center",marginTop:6,letterSpacing:"0.06em"}}>
              Select at least one sector
            </div>
          )}
          <button onClick={()=>setKeys({gemini:null,anthropic:null})}
            style={{
              width:"100%",marginTop:8,padding:"6px",borderRadius:6,cursor:"pointer",
              background:"none",border:"none",color:"#1E293B",fontSize:9,letterSpacing:"0.08em",
            }}>
            ↩ Change API Keys
          </button>
        </div>
      </div>

      {/* ── MAIN AREA ────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        <div style={{
          padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",
          display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,
          background:"rgba(6,10,16,0.8)",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:9,color:"#1E293B",letterSpacing:"0.15em"}}>
              {countryD?.flag} {countryD?.label?.toUpperCase()}
              {cfg.geo?`  ·  ${cfg.geo.toUpperCase()}`:""}
              {`  ·  MIN ${cfg.minLoad} kWp`}
            </div>
            {running&&(
              <div style={{
                display:"flex",alignItems:"center",gap:7,
                background:"rgba(240,165,0,0.07)",borderRadius:4,padding:"3px 10px",
                border:"1px solid rgba(240,165,0,0.15)",
              }}>
                <span className="spin" style={{fontSize:10,color:"#F0A500"}}>◌</span>
                <span style={{fontSize:9,color:"#F0A500",letterSpacing:"0.1em"}}>
                  {progress.phase.toUpperCase()}
                  {progress.tot>0?`  ${progress.cur}/${progress.tot}`:""}
                </span>
              </div>
            )}
          </div>
          {prospects.length>0&&(
            <button onClick={doExport} style={{
              padding:"5px 12px",borderRadius:5,cursor:"pointer",
              background:"rgba(56,189,248,0.08)",border:"1px solid rgba(56,189,248,0.2)",
              color:"#38BDF8",fontSize:9,fontWeight:600,letterSpacing:"0.1em",
            }}>↓ Export JSON</button>
          )}
        </div>

        <div style={{
          padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",
          flexShrink:0,
        }}>
          <div style={{fontSize:8,color:"#1E293B",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:8}}>
            Sectors - Select one or more
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {SECTORS.map(s=>{
              const on = cfg.sectors.includes(s.value);
              return (
                <button key={s.value}
                  onClick={()=>!running&&setCfg(p=>({
                    ...p,sectors:on?p.sectors.filter(x=>x!==s.value):[...p.sectors,s.value]
                  }))}
                  style={{
                    display:"flex",alignItems:"center",gap:6,padding:"5px 11px",
                    borderRadius:5,cursor:running?"default":"pointer",fontSize:11,
                    background:on?"rgba(240,165,0,0.1)":"rgba(255,255,255,0.025)",
                    border:on?"1px solid rgba(240,165,0,0.35)":"1px solid rgba(255,255,255,0.055)",
                    color:on?"#F0A500":"#3D4F63",fontWeight:on?600:400,
                    opacity:running&&!on?0.3:1,transition:"all 0.15s",
                  }}>
                  <span style={{fontSize:14}}>{s.icon}</span>
                  <span>{s.label}</span>
                  <span style={{fontSize:8,color:on?"#F0A50050":"#1E293B",letterSpacing:"0.04em"}}>{s.bench}</span>
                </button>
              );
            })}
          </div>
        </div>

        {running&&(
          <div style={{padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {["discovery","qualification","enrichment"].map((ph,i)=>{
                const phases=["discovery","qualification","enrichment"];
                const pi=phases.indexOf(progress.phase);
                const done=i<pi; const active=i===pi;
                const pct=progress.tot>0?(progress.cur/progress.tot)*100:active?40:0;
                return (
                  <div key={ph} style={{display:"flex",alignItems:"center",flex:1,gap:6}}>
                    <div style={{flex:1,height:2,background:"rgba(255,255,255,0.05)",borderRadius:1,overflow:"hidden"}}>
                      {done&&<div style={{width:"100%",height:"100%",background:"#F0A500"}}/>}
                      {active&&<div style={{width:`${pct}%`,height:"100%",background:"#F0A500",transition:"width 0.3s"}}/>}
                    </div>
                    <span style={{fontSize:8,color:done||active?"#F0A500":"#1E293B",letterSpacing:"0.1em",whiteSpace:"nowrap",textTransform:"uppercase"}}>
                      {ph}{active&&progress.tot>0?` ${progress.cur}/${progress.tot}`:""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{
          display:"flex",borderBottom:"1px solid rgba(255,255,255,0.05)",
          flexShrink:0,background:"rgba(6,10,16,0.5)",
        }}>
          {[
            {key:"results",label:`Prospects${prospects.length?` (${prospects.length})`:""}`},
            {key:"log",label:`Log${logEntries.length?` (${logEntries.length})`:""}`},
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{
              padding:"9px 18px",cursor:"pointer",fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",
              background:"none",border:"none",
              borderBottom:tab===t.key?"2px solid #F0A500":"2px solid transparent",
              color:tab===t.key?"#F0A500":"#2D3F52",
              fontWeight:tab===t.key?600:400,marginBottom:-1,
            }}>{t.label}</button>
          ))}

          {tab==="results"&&prospects.length>0&&(
            <div style={{display:"flex",gap:5,alignItems:"center",marginLeft:"auto",paddingRight:20}}>
              {["all","hot","warm","cool","disqualified"].map(tf=>{
                const t2=TIERS[tf];
                const cnt=tf==="all"?prospects.length:prospects.filter(p=>p.qual?.tier===tf).length;
                return (
                  <button key={tf} onClick={()=>setFilter(tf)} style={{
                    padding:"3px 10px",borderRadius:4,cursor:"pointer",
                    background:filter===tf?(t2?.bg||"rgba(255,255,255,0.06)"):"transparent",
                    border:filter===tf?`1px solid ${t2?.border||"rgba(255,255,255,0.15)"}`:"1px solid transparent",
                    color:filter===tf?(t2?.color||"#E2E8F0"):"#2D3F52",
                    fontSize:8,fontWeight:filter===tf?700:400,letterSpacing:"0.1em",textTransform:"uppercase",
                  }}>
                    {tf==="all"?`ALL ${cnt}`:`${t2?.label||tf} ${cnt}`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {tab==="results"?(
            filtered.length>0?(
              <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
                {filtered.map((p,i)=>(
                  <div key={p.co.name+i} className="fu" style={{animationDelay:`${i*0.03}s`}}>
                    <ProspectCard p={p} idx={i} onEnrich={manualEnrich}/>
                  </div>
                ))}
              </div>
            ):(
              <div style={{
                flex:1,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",gap:14,
              }}>
                <div style={{fontSize:52,opacity:0.05}}>☀</div>
                <div style={{fontSize:10,color:"#1E293B",letterSpacing:"0.2em",textTransform:"uppercase"}}>
                  {running?"Pipeline running - results appear live":"Select sectors and run the pipeline"}
                </div>
                {!running&&(
                  <div style={{fontSize:10,color:"#1E293B",maxWidth:360,textAlign:"center",lineHeight:1.7}}>
                    Choose a country, select target sectors, set your minimum load threshold, then hit Run Pipeline.
                    Gemini will discover candidates, Claude will score them, and contacts will be enriched automatically.
                  </div>
                )}
              </div>
            )
          ):(
            <div style={{flex:1,padding:"16px 20px",overflow:"auto"}}>
              <PipelineLog entries={logEntries}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
