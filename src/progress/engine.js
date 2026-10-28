export const storageKey = 'project-map-platform-v3';
const empty = () => ({version:3,progress:{},questionProgress:{},sessions:{},daily:{},activeSession:null});
const object = x => x && typeof x==='object' && !Array.isArray(x);
const safeKey = k => !['__proto__','constructor','prototype'].includes(k);
function marks(value) {
  if (!object(value)) throw Error('Некорректные отметки');
  const out={};
  for(const [id,v] of Object.entries(value)) {
    if(!safeKey(id)||!object(v)||!['done','again','partial'].includes(v.status)|| (v.updatedAt!==undefined&&typeof v.updatedAt!=='string')) throw Error('Некорректная отметка');
    out[id]={status:v.status,updatedAt:v.updatedAt||''};
  }
  return out;
}
function sessionMap(value) {
  if(!object(value))throw Error('Некорректные интервью');
  const result={};
  for(const [key,s] of Object.entries(value)) {
    if(!safeKey(key)||!object(s)||typeof s.id!=='string'||!['daily','full'].includes(s.kind)||typeof s.date!=='string'||!Array.isArray(s.questionIds)||new Set(s.questionIds).size!==s.questionIds.length||!s.questionIds.every(id=>typeof id==='string'&&safeKey(id))||!Number.isInteger(s.index)||s.index<0||s.index>s.questionIds.length||typeof s.finished!=='boolean'||!Array.isArray(s.skipped)||!s.skipped.every(id=>s.questionIds.includes(id))||!object(s.ratings)||!object(s.snapshots))throw Error('Некорректное интервью');
    for(const [id,rating] of Object.entries(s.ratings))if(!s.questionIds.includes(id)||!['done','partial','again'].includes(rating))throw Error('Некорректная оценка интервью');
    if(s.reviewed!==undefined&&(!Array.isArray(s.reviewed)||s.reviewed.some(id=>!s.questionIds.includes(id))))throw Error('Некорректные просмотренные ответы');
    if(s.followupChoices!==undefined){
      if(!object(s.followupChoices))throw Error('Некорректный выбор уточнений');
      for(const [id,indices] of Object.entries(s.followupChoices))if(!s.questionIds.includes(id)||!Array.isArray(indices)||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=(s.snapshots[id]?.followups?.length||0)))throw Error('Некорректный выбор уточнений');
    }
    for(const id of s.questionIds){const q=s.snapshots[id];if(!object(q)||q.id!==id||typeof q.prompt!=='string'||typeof q.answer!=='string'||typeof q.title!=='string'||(q.followups!==undefined&&(!Array.isArray(q.followups)||!q.followups.every(f=>typeof f==='string')))||['noteId','heading','topicId','details','shortAnswer','category','kind','source'].some(k=>q[k]!==undefined&&typeof q[k]!=='string'))throw Error('Некорректный сохранённый вопрос');}
    if(Object.values(s.snapshots).some(q=>q.followupAnswers!==undefined&&(!Array.isArray(q.followupAnswers)||q.followupAnswers.some(f=>!object(f)||typeof f.title!=='string'||typeof f.answer!=='string'))))throw Error('Некорректные уточнения');
    for(const q of Object.values(s.snapshots)){
      if(q.criteria!==undefined&&typeof q.criteria!=='string')throw Error('Некорректные критерии');
      if(q.curriculumTier!==undefined&&!['core','extended','vacancy'].includes(q.curriculumTier))throw Error('Некорректный уровень маршрута');
      if(q.learningLinks!==undefined&&(!Array.isArray(q.learningLinks)||q.learningLinks.some(l=>!object(l)||!['theory','practice'].includes(l.kind)||['noteId','heading','label'].some(k=>typeof l[k]!=='string'))))throw Error('Некорректные учебные ссылки');
    }
    if(!s.questionIds.length||(!s.finished&&s.index===s.questionIds.length)||(s.followupIndex!==undefined&&(!Number.isInteger(s.followupIndex)||s.followupIndex<0||s.followupIndex>(s.snapshots[s.questionIds[s.index]]?.followups?.length||0))))throw Error('Некорректная позиция интервью');
    result[key]=structuredClone(s);
  }
  return result;
}
function validated(value) {
  if(!object(value)||![1,2,3].includes(value.version))throw Error('Неизвестный формат прогресса');
  const s=empty();s.progress=marks(value.progress);s.questionProgress=value.version===1?{}:marks(value.questionProgress);
  if(value.version===3){s.sessions=sessionMap(value.sessions);s.daily=sessionMap(value.daily);if(Object.entries(s.daily).some(([key,v])=>key!==v.date||v.kind!=='daily'||v.id!==`daily:${key}`)||Object.entries(s.sessions).some(([key,v])=>key!==v.id||v.kind!=='full'))throw Error('Некорректный каталог интервью');s.activeSession=value.activeSession;if(s.activeSession!==null&&(typeof s.activeSession!=='string'||![...Object.values(s.sessions),...Object.values(s.daily)].some(x=>x.id===s.activeSession)))throw Error('Не найдено активное интервью');}
  return s;
}
export function loadState(storage=localStorage) {
  const raw=storage.getItem(storageKey);if(raw!==null)return validated(JSON.parse(raw));
  const v2=storage.getItem('project-map-review-v2');if(v2!==null)return validated(JSON.parse(v2));
  const v1=storage.getItem('project-map-review-v1');return v1===null?empty():validated({version:1,progress:JSON.parse(v1)});
}
export function saveState(state,storage=localStorage){const next=validated(state);storage.setItem(storageKey,JSON.stringify(next));return next;}
export function exportState(state){return JSON.stringify(validated(state),null,2);}
export function importState(text,current){if(text.length>15_000_000)throw Error('Файл слишком большой');const incoming=validated(JSON.parse(text));const base=validated(current);return {...base,progress:{...base.progress,...incoming.progress},questionProgress:{...base.questionProgress,...incoming.questionProgress},sessions:{...base.sessions,...incoming.sessions},daily:{...base.daily,...incoming.daily},activeSession:incoming.activeSession||base.activeSession};}
export function rateQuestion(state,id,status){if(!safeKey(id)||!['done','partial','again'].includes(status))throw Error('Некорректная отметка');return {...state,questionProgress:{...state.questionProgress,[id]:{status,updatedAt:new Date().toISOString()}}};}
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function usedFollowups(session){
  const id=session.questionIds[session.index];
  // Legacy sessions stepped through the original list. Keep that position intact.
  return session.followupChoices?.[id]??Array.from({length:session.followupIndex||0},(_,i)=>i);
}
export function availableFollowups(session){
  if(session.finished)return [];
  const id=session.questionIds[session.index],used=usedFollowups(session);
  if(used.length>=(session.kind==='daily'?1:2))return [];
  return (session.snapshots[id]?.followups||[]).map((text,index)=>({index,rank:hash(`${session.id}|${id}|${text}`)}))
    .filter(({index})=>!used.includes(index)).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(({index})=>index);
}
export function openFollowup(session){
  const index=availableFollowups(session)[0];if(index===undefined)return session;
  const next=structuredClone(session),id=next.questionIds[next.index];
  next.followupChoices={...next.followupChoices,[id]:[...usedFollowups(session),index]};
  next.followupIndex=index+1;return next;
}
export function advanceQuestion(session,skip=false){
  if(session.finished)return session;
  const next=structuredClone(session),id=next.questionIds[next.index];
  if(skip&&!next.skipped.includes(id))next.skipped.push(id);
  next.index++;next.followupIndex=0;next.finished=next.index>=next.questionIds.length;
  return next;
}
export function selectInterview(questions,kind,date,history=[],progress={}){
  const hasCurriculum=questions.some(q=>q.curriculumTier!==undefined);
  const eligible=questions.filter(q=>(q.source==='projects'||!hasCurriculum||q.curriculumTier==='core')&&q.availableAnswer!==false&&!q.parentId);
  const categoryOf=q=>['Тестирование','Инженерные вопросы'].includes(q.category)?'Архитектура, производительность и тестирование':q.category;
  const recent=new Set(history.flatMap(s=>s.questionIds));
  const weak=q=>['again','partial'].includes(progress[q.id]?.status);
  const order=(a,b)=>Number(weak(b))-Number(weak(a))||Number(recent.has(a.id))-Number(recent.has(b.id))||hash(date+a.id)-hash(date+b.id)||a.id.localeCompare(b.id);
  const chosen=[];const seen=new Set();
  const add=q=>{if(q&&!seen.has(q.id)){chosen.push(q);seen.add(q.id);}};
  const take=(pool,count)=>pool.filter(q=>!seen.has(q.id)).sort(order).slice(0,count).forEach(add);
  const full=kind==='full',theory=eligible.filter(q=>q.kind==='theory');
  // Reserve every group before filling optional places: JS/TS cannot crowd out Vue.
  for(const [category,count] of [['JavaScript',full?2:1],['TypeScript',2],['Vue',full?3:2],['Браузер, HTML и CSS',1],['Сети и безопасность',1],['Архитектура, производительность и тестирование',full?2:1]])
    take(theory.filter(q=>categoryOf(q)===category),count);
  const practice=eligible.filter(q=>q.kind==='practice'&&['JavaScript','TypeScript','Vue','Тестирование'].includes(q.category));
  const design=eligible.filter(q=>q.kind==='design');
  if(full){take(practice,2);take(design,1);}else take(hash(date)%2&&design.length?design:practice,1);
  const projects=eligible.filter(q=>q.kind==='project');
  if(full){
    take(projects.filter(q=>q.project==='trajectory'),1);
    take(projects.filter(q=>q.project==='inbox'),1);
    take(projects.filter(q=>q.project==='lanit'&&['ln-registration','ln-dispatch'].includes(q.topicId)),1);
    take(projects.filter(q=>q.project==='lanit'&&['ln-org','ln-rules'].includes(q.topicId)),1);
    take(projects.filter(q=>q.project==='lanit'&&!['ln-registration','ln-dispatch','ln-org','ln-rules'].includes(q.topicId)),1);
    take(eligible.filter(q=>q.kind==='behavioral'),1);
  }else{
    take(projects.filter(q=>q.project!=='lanit'),1);
    take(projects.filter(q=>q.project==='lanit'),1);
    take(projects,2-chosen.filter(q=>q.kind==='project').length);
    if(chosen.length<12)take(theory.filter(weak),1);
  }
  return chosen;
}
function makeSession(chosen,kind,date,id){return {id,kind,date,questionIds:chosen.map(q=>q.id),index:0,finished:false,skipped:[],ratings:{},snapshots:Object.fromEntries(chosen.map(q=>[q.id,structuredClone(q)]))};}
export function createSession(questions,kind='full',progress={}){const date=localDate();const id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;return makeSession(selectInterview(questions,kind,date+id,[],progress),kind,date,id);}
export function dailySession(state,questions,date=localDate()){
  if(state.daily[date])return state;
  const history=Object.entries(state.daily).filter(([d])=>d<date).sort(([a],[b])=>b.localeCompare(a)).slice(0,3).map(([,s])=>s);
  const session=makeSession(selectInterview(questions,'daily',date,history,state.questionProgress),'daily',date,`daily:${date}`);
  if(!session.questionIds.length)return state;
  return {...state,daily:{...state.daily,[date]:session}};
}
