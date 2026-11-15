'use strict';
const state = {view:'home', overview:null, masters:[], matches:[], customer:'MDM-1005', selectedSource:'crm', chat:[]};
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asMoney = value => '$'+Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const api = async (url, options={}) => { const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options}); const d=await r.json(); if(!r.ok)throw Error(d.error||`Request failed (${r.status})`); return d; };
let toastTimeout;
const toast=(message,error=false)=>{const el=$('#toast');el.textContent=message;el.className='toast show'+(error?' error':'');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),4400)};

async function refresh(){
  const [overview,masters,matches]=await Promise.all([api('/api/overview'),api('/api/masters'),api('/api/matches')]);
  state.overview=overview;state.masters=masters;state.matches=matches;
  $('#match-nav-count').textContent=matches.length||'0';
  renderOverview();renderCustomers();renderMatches();renderChatSelect();
  const aiEnabled=overview.assistant_mode.startsWith('LLM');
  $('#assistant-mode-label').textContent=aiEnabled?'AI synthesis · grounded in CSV records':'Guided answers · source evidence included';
  $('#assistant-explainer').textContent=aiEnabled?'An optional AI model synthesizes answers using the selected fictional customer snapshot. Source evidence remains visible.':'By default, a transparent rule-based router answers using the linked CSVs. No generative model or API key is required.';
}
function go(view){
  if(!['home','customers','matches','assistant','data'].includes(view))view='home';
  state.view=view;
  $$('.view').forEach(el=>el.classList.toggle('hide',el.id!==`view-${view}`));
  $$('.nav-link').forEach(el=>{el.classList.toggle('active',el.dataset.nav===view); if(el.dataset.nav===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  if(view==='data') renderSource();
  if(view==='customers')renderCustomerDetail();
  if(view==='assistant')renderChat();
  history.replaceState(null,'','#'+view);
  window.scrollTo({top:0,behavior:'instant'});
}
function renderOverview(){
 if(!state.overview)return;
 const c=state.overview.counts;
 const metrics=[
  {n:c.sources,label:'Connected source systems',meta:'Simple, editable CSV files'},
  {n:c.source_records,label:'Customer source rows',meta:'Across CRM, policy & billing'},
  {n:c.golden_records,label:'Trusted customer identities',meta:'Joined by a golden ID'},
  {n:c.pending_matches,label:'Possible matches to review',meta:'Awaiting human approval',accent:true},
 ];
 $('#metric-grid').innerHTML=metrics.map(m=>`<div class="metric-card ${m.accent?'emphasis':''}"><div class="metric-label">${esc(m.label)}</div><div class="metric-number">${m.n}</div><div class="metric-meta">${esc(m.meta)}</div></div>`).join('');
}
function renderCustomers(){
 const search=($('#customer-search').value||'').trim().toLowerCase();
 const matches=state.masters.filter(m=>`${m.golden_id} ${m.full_name} ${m.email}`.toLowerCase().includes(search));
 $('#customer-count').textContent=`${matches.length} of ${state.masters.length} customers`;
 $('#customer-list').innerHTML=matches.map(m=>`<button class="customer-item ${m.golden_id===state.customer?'selected':''}" data-customer="${esc(m.golden_id)}"><div class="customer-item-top"><span class="customer-avatar">${esc(m.full_name[0])}</span><span class="pill ${m.source_count===3?'green':'amber'}">${m.source_count} linked</span></div><strong>${esc(m.full_name)}</strong><small>${esc(m.golden_id)} · ${esc(m.email)}</small><span class="customer-facts">${m.policies} policies · ${m.claims} claims · ${m.invoices} invoices</span></button>`).join('')||'<div class="empty-state">No matching customers found.</div>';
}
async function chooseCustomer(id,nav=true){state.customer=id;renderCustomers();await renderCustomerDetail();renderChatSelect();if(nav)go('customers')}
const dataRows=(rows,empty)=>rows.length?rows.map(r=>`<div class="data-row"><div><strong>${esc(r.title)}</strong><small>${esc(r.subtitle)}</small></div><div class="right">${esc(r.right)}${r.tag?`<br/><span class="pill ${r.tag==='Overdue'||r.tag==='Open'?'amber':'green'}">${esc(r.tag)}</span>`:''}</div></div>`).join(''):`<p class="muted">${esc(empty)}</p>`;
async function renderCustomerDetail(){
 const target=$('#customer-detail');if(!target||!state.masters.length)return;
 const d=await api('/api/masters/'+encodeURIComponent(state.customer));
 const fields=[['Full name','full_name'],['Date of birth','dob'],['Email','email'],['Phone','phone'],['Address','address']];
 target.innerHTML=`<div class="detail-hero"><div class="detail-title"><span class="customer-avatar" style="height:58px;width:58px;font-size:24px">${esc(d.full_name[0])}</span><div><h2>${esc(d.full_name)}</h2><small>${esc(d.golden_id)} · Unified customer record</small></div></div><div class="detail-stats"><div><strong>${d.source_count}</strong><span>Linked sources</span></div><div><strong>${d.policies.length}</strong><span>Policies</span></div><div><strong>${d.claims.length}</strong><span>Claims</span></div></div><button class="button primary" data-nav="assistant">Ask about this customer ↗</button></div>
 <div class="detail-grid">
 <div class="detail-box"><h3>Trusted identity</h3><p>Current CRM-first field selection, with traceable source IDs.</p>${fields.map(([label,key])=>`<div class="field-row"><span>${label}</span><div><strong>${esc(d[key]||'—')}</strong><small>↳ ${esc(d.provenance[key]?.system||'Unknown')} · ${esc(d.provenance[key]?.source_id||'—')}</small></div></div>`).join('')}</div>
 <div class="detail-box"><h3>Policy portfolio</h3><p>Joined through the linked PolicyCenter customer ID.</p>${dataRows(d.policies.map(p=>({title:p.product,subtitle:`${p.policy_id} · renews ${p.renewal_date}`,right:asMoney(p.premium)+'/yr',tag:p.status})),'No policies linked yet. Review a pending identity match to connect them.')}</div>
 <div class="detail-box"><h3>Claims</h3><p>Claims belong to linked policy records, not to the master data store.</p>${dataRows(d.claims.map(c=>({title:c.loss_type,subtitle:`${c.claim_id} · opened ${c.opened_date}`,right:asMoney(c.estimated_loss),tag:c.status})),'No claims found in linked source records.')}</div>
 <div class="detail-box"><h3>Billing</h3><p>Only invoices linked through the billing identity are displayed.</p>${dataRows(d.invoices.map(i=>({title:i.invoice_id,subtitle:`${i.policy_id} · due ${i.due_date}`,right:asMoney(i.amount),tag:i.status})),'No invoices linked yet. Review a pending billing match.')}</div>
 <div class="detail-box detail-wide"><h3>Source identity map</h3><p>The golden ID joins—not overwrites—the individual source identities.</p><div class="source-chips">${d.linked_sources.map(s=>`<div class="source-chip"><strong>${esc(s.label)}</strong>${esc(s.source_id)}<br/>${esc(s.full_name)}</div>`).join('')}</div></div>
 <div class="detail-box detail-wide"><h3>Field differences <span class="pill ${d.conflicts.length?'amber':'green'}">${d.conflicts.length}</span></h3><p>Identities may be linked even when an address, name, or email differs. Differences are retained for stewardship.</p>${d.conflicts.length?`<div class="conflict-list">${d.conflicts.map(c=>`<div class="conflict-card"><strong>${esc(c.field)}</strong>${c.values.map(v=>`<p>${esc(v.system)}: <b>${esc(v.value)}</b></p>`).join('')}</div>`).join('')}</div>`:'<span class="pill green">No differences among linked records</span>'}</div></div>`;
}
function renderMatches(){
 $('#pending-count').textContent=state.matches.length;
 const target=$('#matches-list');
 if(!state.matches.length){target.innerHTML=`<div class="empty-state"><div class="assistant-orb large-orb">✓</div><h3>All caught up.</h3><p>No eligible unreviewed pairs remain. You can reset the sample and try again.</p><button class="button primary" data-reset="yes">Reset match review</button></div>`;return}
 target.innerHTML=state.matches.map(m=>`<article class="match-card"><div class="match-top"><div><h3>${esc(m.candidate.full_name)}</h3><small>${esc(m.source_label)} · ${esc(m.source_id)}</small></div><div class="score" style="--pct:${Math.min(100,m.score)}%" aria-label="Match score ${m.score} out of 100"><span>${m.score}%</span></div></div><div class="pair"><div class="pair-part"><small>MASTERED PROFILE</small><strong>${esc(m.master_name)}</strong><span>${esc(m.golden_id)}</span></div><div class="pair-arrow">↔</div><div class="pair-part"><small>UNLINKED SOURCE</small><strong>${esc(m.candidate.full_name)}</strong><span>${esc(m.source_id)}</span></div></div><div class="evidence">${m.evidence.map(e=>`<span>✓ ${esc(e)}</span>`).join('')}</div><p class="match-conflicts">${m.conflicts.length?'⚠ '+m.conflicts.map(esc).join(' · '):'✓ No key field conflicts detected'}</p><div class="match-actions"><button class="button outlined" data-decision="rejected" data-golden="${esc(m.golden_id)}" data-source="${esc(m.source)}" data-source-id="${esc(m.source_id)}">Not the same</button><button class="button primary" data-decision="approved" data-golden="${esc(m.golden_id)}" data-source="${esc(m.source)}" data-source-id="${esc(m.source_id)}">Approve link →</button></div></article>`).join('');
}
async function decide(button){
 const payload={decision:button.dataset.decision,golden_id:button.dataset.golden,source:button.dataset.source,source_id:button.dataset.sourceId};
 button.disabled=true;
 try{const result=await api('/api/matches/decision',{method:'POST',body:JSON.stringify(payload)});await refresh();toast(result.message);if(payload.decision==='approved')state.customer=payload.golden_id;}catch(error){toast(error.message,true)}finally{button.disabled=false}
}
function renderChatSelect(){
 const el=$('#chat-customer'), before=el.value||state.customer;
 el.innerHTML=state.masters.map(m=>`<option value="${esc(m.golden_id)}">${esc(m.full_name)} — ${esc(m.golden_id)}</option>`).join('');
 el.value=state.masters.some(m=>m.golden_id===before)?before:state.customer;
}
function renderChat(){
 const body=$('#chat-body');if(!state.chat.length)return;
 body.innerHTML=state.chat.map(m=>`<div class="chat-bubble ${m.role==='user'?'user':'bot'}"><small>${m.role==='user'?'You':'MasterData assistant'}</small><div>${esc(m.text)}</div>${m.mode?`<small style="margin-top:8px">${esc(m.mode)}</small>`:''}${m.evidence?.length?`<div class="answer-meta">${m.evidence.map(e=>`<span>↳ ${esc(e)}</span>`).join('')}</div><details class="trace-details"><summary>See technical retrieval trace</summary><ul>${m.trace.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details>`:''}</div>`).join('');
 body.scrollTop=body.scrollHeight;
}
async function ask(question){
 const customer_id=$('#chat-customer').value;
 if(!customer_id||!question.trim())return;
 const input=$('#question-input');input.value='';input.disabled=true;
 state.chat.push({role:'user',text:question});renderChat();go('assistant');
 try{const answer=await api('/api/ask',{method:'POST',body:JSON.stringify({customer_id,question})});state.chat.push({role:'assistant',text:answer.reply,evidence:answer.evidence,trace:answer.trace,mode:answer.mode});renderChat();}
 catch(error){state.chat.push({role:'assistant',text:'I could not retrieve a result: '+error.message});renderChat();}
 finally{input.disabled=false;input.focus();}
}
const sourceNames={crm:'CRM customers',policy:'Policy customers',billing:'Billing customers',policies:'Policies',claims:'Claims',invoices:'Invoices',identity_links:'Identity links',decisions:'Review decisions'};
async function renderSource(){
 $('#source-tabs').innerHTML=Object.entries(sourceNames).map(([id,name])=>`<button data-source="${id}" class="${state.selectedSource===id?'active':''}">${esc(name)}</button>`).join('');
 $('#csv-download').href='/api/sources/'+state.selectedSource+'/download';
 $('#source-explorer').innerHTML='<div class="source-explorer-head">Loading source data...</div>';
 try{
  const data=await api('/api/sources/'+state.selectedSource),rows=data.records;
  const keys=rows.length?Object.keys(rows[0]):[];
  if(!keys.length){$('#source-explorer').innerHTML=`<div class="source-explorer-head"><strong>${esc(data.filename)}</strong><span>${rows.length} rows</span></div><div class="empty-tests">No decisions recorded yet.</div>`;return}
  $('#source-explorer').innerHTML=`<div class="source-explorer-head"><strong>${esc(data.filename)}</strong><span>${rows.length} rows · CSV snapshot</span></div><div class="table-scroll"><table class="data-table"><thead><tr>${keys.map(k=>`<th>${esc(k.replaceAll('_',' '))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 }catch(error){toast(error.message,true)}
}
async function runTests(){const button=$('#run-tests');button.disabled=true;button.textContent='Running checks…';try{const result=await api('/api/tests/run');$('#test-results').classList.remove('empty-tests');$('#test-results').innerHTML=`<div class="test-summary">${result.passed===result.total?'✓':'!'} ${result.passed} of ${result.total} checks passed <small style="font-weight:400;margin-left:auto">On-demand result</small></div>${result.tests.map(t=>`<div class="test-result-row"><div><strong>${esc(t.name)}</strong><small>${esc(t.detail)}</small></div><span class="${t.passed?'pass':'fail'}">${t.passed?'✓ Pass':'✕ Fail'}</span></div>`).join('')}`;toast(`QA checks complete: ${result.passed}/${result.total} passed`)}catch(error){toast(error.message,true)}finally{button.disabled=false;button.textContent='Run QA checks →'}}
async function resetDemo(){if(!confirm('Reset match approvals and review decisions to the original sample? This affects the shared demo.'))return;try{await api('/api/reset',{method:'POST',body:'{}'});await refresh();renderSource();toast('Sample identity review has been reset')}catch(error){toast(error.message,true)}}

document.addEventListener('click',async event=>{
 const nav=event.target.closest('[data-nav]');if(nav){go(nav.dataset.nav);return}
 const open=event.target.closest('[data-open-customer]');if(open){await chooseCustomer(open.dataset.openCustomer);return}
 const selected=event.target.closest('[data-customer]');if(selected){await chooseCustomer(selected.dataset.customer,false);return}
 const decision=event.target.closest('[data-decision]');if(decision){await decide(decision);return}
 const src=event.target.closest('[data-source]');if(src){state.selectedSource=src.dataset.source;await renderSource();return}
 const q=event.target.closest('[data-question]');if(q){await ask(q.dataset.question);return}
 if(event.target.closest('[data-reset]')||event.target.id==='reset-demo'||event.target.id==='reset-from-matches'){await resetDemo();return}
 if(event.target.closest('#run-tests')){await runTests();}
});
$('#customer-search').addEventListener('input',renderCustomers);
$('#chat-customer').addEventListener('change',event=>{state.customer=event.target.value;renderCustomers()});
$('#ask-form').addEventListener('submit',async event=>{event.preventDefault();await ask($('#question-input').value)});
window.addEventListener('hashchange',()=>go(location.hash.replace('#','')));
(async()=>{try{await refresh();go(location.hash.replace('#','')||'home')}catch(error){toast('Unable to load CSV data: '+error.message,true)}})();
