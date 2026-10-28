<script setup lang="ts">
import {ref,watch,onBeforeUnmount,nextTick} from 'vue';
const props=defineProps<{materialKey:string;title:string;context:string}>();
type Message={role:'user'|'assistant';text:string;status:string};
const opened=ref(false),messages=ref<Message[]>([]),draft=ref(''),error=ref(''),busy=ref(false),loading=ref(false),loaded=ref(false),field=ref<HTMLTextAreaElement>();
let controller:AbortController|undefined,generation=0;
const endpoint=()=>'/api/study-chat?key='+encodeURIComponent(props.materialKey);
async function load(){
  const version=++generation;loading.value=true;loaded.value=false;error.value='';
  try{const r=await fetch(endpoint());const data=await r.json();if(!r.ok)throw Error(data.error);if(version!==generation)return;messages.value=data.messages;busy.value=data.busy;loaded.value=true;}
  catch(e){if(version===generation)error.value=e instanceof Error?e.message:'Не удалось загрузить обсуждение.';}
  finally{if(version===generation)loading.value=false;}
}
async function toggle(){opened.value=!opened.value;if(opened.value){if(!controller)await load();await nextTick();field.value?.focus();}}
async function send(){
  if(busy.value||!loaded.value||!draft.value.trim())return;
  const text=draft.value,version=generation,url=endpoint();
  controller=new AbortController();busy.value=true;error.value='';
  const reply:Message={role:'assistant',text:'',status:'pending'};
  messages.value.push({role:'user',text,status:'completed'},reply);const index=messages.value.length-1;
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,context:props.context}),signal:controller.signal});
    if(!r.ok){const data=await r.json();throw Error(data.error);}
    draft.value='';const reader=r.body!.getReader(),decoder=new TextDecoder();let buffer='',done=false;
    while(true){const part=await reader.read();buffer+=decoder.decode(part.value,{stream:!part.done});
      const lines=buffer.split('\n');buffer=lines.pop()!;
      for(const line of lines){if(!line)continue;const event=JSON.parse(line);if(version!==generation)continue;if(event.delta)messages.value[index]!.text+=event.delta;if(event.error)throw Error(event.error);if(event.done)done=true;}
      if(part.done)break;
    }
    if(!done)throw Error('Связь прервалась. Обновите обсуждение, чтобы проверить сохранённый ответ.');
    if(version===generation)messages.value[index]!.status='completed';
  }catch(e){if(version===generation){messages.value[index]!.status='interrupted';error.value=e instanceof Error?e.message:'Не удалось получить ответ.';}}
  finally{if(version===generation){busy.value=false;controller=undefined;}}
}
async function stop(){try{const r=await fetch('/api/study-chat/cancel?key='+encodeURIComponent(props.materialKey),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();}catch{error.value='Не удалось остановить запрос. Обновите обсуждение для проверки состояния.';}}
watch(()=>props.materialKey,()=>{generation++;controller?.abort();opened.value=false;messages.value=[];draft.value='';busy.value=false;loaded.value=false;});
onBeforeUnmount(()=>{generation++;controller?.abort();});
</script>
<template>
  <section class="study-chat" aria-label="Обсуждение материала с Codex">
    <button :aria-expanded="opened" @click="toggle">{{opened?'Свернуть обсуждение':'Разобраться с Codex'}}</button>
    <div v-if="opened" class="study-chat-panel">
      <h3>Codex · {{title}}</h3>
      <p class="platform-muted">Вопросы по этому материалу и вашему ответу. Сообщения и материал отправляются в Codex через вход ChatGPT; действуют лимиты подписки. История хранится на этом компьютере отдельно от экспорта прогресса.</p>
      <details><summary>Какой контекст получит Codex</summary><pre>{{context}}</pre></details>
      <p v-if="loading" role="status">Загружаем обсуждение…</p>
      <p v-else-if="loaded&&!messages.length">Обсуждения пока нет. Задайте вопрос или выберите действие ниже.</p>
      <div class="study-messages" aria-label="История обсуждения" :aria-busy="busy">
        <article v-for="(message,i) in messages" :key="i" class="study-message" :class="message.role">
          <strong>{{message.role==='user'?'Вы':'Codex'}}</strong><pre>{{message.text||(message.status==='pending'?'Готовит ответ…':'Ответ не получен.')}}</pre>
          <small v-if="['failed','interrupted'].includes(message.status)">Ответ не завершён</small>
        </article>
      </div>
      <p v-if="error" role="alert">{{error}}</p>
      <div class="platform-actions">
        <button :disabled="busy||!loaded" @click="draft='Дай небольшую подсказку, без полного решения.';field?.focus()">Дай подсказку</button>
        <button :disabled="busy||!loaded" @click="draft='Проверь мой ответ по критериям: ';field?.focus()">Проверь мой ответ</button>
        <button :disabled="busy||!loaded" @click="draft='Объясни на примере связанного проекта. Отделяй прочитанный код от предположений.';field?.focus()">Пример из проекта</button>
      </div>
      <form @submit.prevent="send">
        <label>Ваш вопрос или ответ<textarea ref="field" v-model="draft" rows="4" maxlength="8000" :disabled="busy||!loaded" placeholder="Что осталось непонятно?" /></label>
        <div class="platform-actions"><button class="primary" :disabled="busy||!loaded||!draft.trim()" type="submit">Отправить</button><button v-if="busy" type="button" @click="stop">Остановить</button><button type="button" :disabled="loading||!!controller" @click="load">Обновить обсуждение</button></div>
        <p role="status">{{busy?'Codex отвечает…':''}}</p>
      </form>
    </div>
  </section>
</template>
<style scoped>
.study-chat{margin-block:1rem}.study-chat-panel{margin-top:1rem;border:1px solid var(--border,#c6ccd5);border-radius:12px;padding:clamp(12px,2vw,24px);max-width:100%;min-width:0}.study-chat-panel h3{overflow-wrap:anywhere}.study-chat-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:32rem;overflow:auto}.study-chat-panel details pre{font-size:.85rem}.study-chat-panel textarea{display:block;width:100%;box-sizing:border-box;margin-block:.5rem;resize:vertical}.study-message{border-left:3px solid #7d899b;padding:.7rem 1rem;margin-block:.8rem;background:var(--surface,#f5f7fa);color:var(--text,#172033);border-radius:6px}.study-message.user{border-color:#476cba}.study-message pre{margin:.5rem 0}.study-chat-panel form{margin-top:1rem}
</style>
