import {questionCards} from './review.js';
import {projects} from './catalog/data.js';

// Adapt the existing map; IDs, answers and code remain owned by its topics.
export function projectQuestions(topics) {
  return questionCards(topics).map(card=>{
    const topic=topics.find(t=>t.id===card.topicId);
    const q=card.pilot.questions.find(q=>q.id===card.questionId);
    const commercial=card.project==='lanit';
    const scope=commercial?'Коммерческий опыт':'Личный проект';
    const limits=commercial?'Учебный код cokr не подтверждает историческую реализацию или личное авторство. Расскажите только о том, что действительно делали.':'Отделите собственную работу от решений библиотек и помощи других участников.';
    const facts=commercial&&topic.story?.short?`Подтверждённый рассказ о работе: ${topic.story.short}\n\n`:'';
    return {id:card.id,source:'projects',kind:'project',category:commercial?'Коммерческий опыт':'Собственные проекты',
      title:card.question,prompt:`${card.question}\n\n${scope}: ${projects[card.project]?.name||card.project} — ${topic.title}. ${limits}`,
      answer:facts+card.answer,details:[...(q.detailed||[]),q.example,commercial?topic.story?.boundaries:''].filter(Boolean).join('\n\n'),
      criteria:'Объясняю задачу, свою часть работы, решение и альтернативу, сложность и способ проверки результата. Разделяю подтверждённые факты и учебные предположения.',
      topicId:card.topicId,project:card.project,projectGroup:topic.group,availableAnswer:true,
      followups:topic.interview||[],
      learningLinks:[...(topic.pilot.study||[]).map(n=>({kind:'theory',noteId:n.path.replace(/\.md$/,''),heading:'',label:n.label})),
        ...(commercial?topic.sources.filter(([p])=>p.startsWith('Опыт и проекты/')).map(([p,label])=>({kind:'theory',noteId:p.replace(/\.md$/,''),heading:'',label})):[])]};
  });
}
