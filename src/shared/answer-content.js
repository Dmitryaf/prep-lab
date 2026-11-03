const normalize = (text = '') => text.replace(/\r\n?/g, '\n').trim();

// Remove only metadata that is already rendered in the separate followup section.
// Unknown lists and code examples must remain intact.
function withoutFollowupList(text, followups = []) {
  if (!followups.length) return text;
  const known = new Set(followups), lines = text.split('\n'), result = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i])?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      result.push(lines[i]);
      continue;
    }
    if (!fence && /^\*\*Уточнения\*\*:?[ \t]*$/.test(lines[i])) {
      let end = i + 1;
      while (end < lines.length && !lines[end].trim()) end++;
      const titles = [];
      while (end < lines.length && /^[-*] /.test(lines[end])) {
        titles.push(lines[end].slice(2).trim());
        end++;
      }
      // A nonblank continuation could contain part of a question or explanation.
      if (titles.length && titles.every(title => known.has(title)) &&
          (end === lines.length || !lines[end].trim())) {
        i = end - 1;
        continue;
      }
    }
    result.push(lines[i]);
  }
  return result.join('\n').trim();
}

/** @param {Pick<import('./types').Question, 'answer' | 'shortAnswer' | 'details' | 'followups'>} question */
export function answerContent(question) {
  const short = normalize(question.shortAnswer), full = normalize(question.answer);
  const main = withoutFollowupList(short || full, question.followups);
  let additional = '';
  if (short && full !== short) {
    const rest = full.startsWith(short + '\n\n') ? full.slice(short.length).trim() : full;
    additional = withoutFollowupList(rest, question.followups);
  }
  const details = normalize(question.details);
  return {main, additional, details:details === main || details === additional ? '' : details};
}
