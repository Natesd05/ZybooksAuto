// Original questions and simulated behavior using the live DOM structure inspected 2026-09-14.
export function liveActivity(id: string, kind: 'animation' | 'single_choice', complete = false) {
  const marker = `<div class="activity-title-bar"><div class="activity-type">Participation activity</div><div class="title-bar-chevron" role="img" aria-label="Activity ${complete ? 'completed' : 'not completed'}"></div></div>`;
  const content =
    kind === 'animation'
      ? `<div class="animation-player"><div class="animation-controls"><button class="start-button" aria-label="Start">Start</button><input type="checkbox" aria-labelledby="speed-${id}"><label id="speed-${id}">2x speed</label></div><div aria-live="assertive"></div></div>`
      : `<div class="question-set-question multiple-choice-question"><div class="question">Which number is even?</div><div class="question-choices" role="radiogroup"><label><input type="radio" name="q-${id}">3</label><label><input type="radio" name="q-${id}">4</label></div><div class="zb-explanation" role="alert"></div><div class="question-chevron participation" role="img" aria-label="Question ${complete ? 'completed' : 'not completed'}"></div></div>`;
  return `<div class="interactive-activity-container participation ${kind === 'single_choice' ? 'multiple-choice-content-resource' : 'content-tool-content-resource'}" content_resource_id="${id}">${marker}<div class="activity-payload">${content}</div></div>`;
}

export const liveBehavior = `
window.liveActions = [];
document.addEventListener('click', event => {
  const target = event.target;
  const root = target.closest('.interactive-activity-container');
  if (!root) return;
  const mark = () => root.querySelector('.title-bar-chevron').setAttribute('aria-label', 'Activity completed');
  if (target.matches('input[type=checkbox]')) return;
  const label = target.getAttribute('aria-label');
  if (label === 'Start' || label === 'Play') {
    window.liveActions.push(label + ':' + event.isTrusted);
    const step = root.querySelector('.step-highlight');
    const number = step ? Number(step.textContent) + 1 : 1;
    target.classList.remove('start-button');
    target.setAttribute('aria-label', 'Pause');
    target.textContent = 'Pause';
    if (step) step.textContent = String(number);
    else target.insertAdjacentHTML('afterend', '<button class="step step-highlight">1</button>');
    setTimeout(() => {
      target.setAttribute('aria-label', 'Play');
      target.textContent = 'Play';
      if (number === 2) mark();
    }, 70);
  }
  if (target.matches('input[type=radio]')) {
    const question = target.closest('.multiple-choice-question');
    const choice = Array.from(question.querySelectorAll('input')).indexOf(target);
    window.liveActions.push('choice:' + choice + ':' + event.isTrusted);
    setTimeout(() => {
      const feedback = question.querySelector('.zb-explanation');
      feedback.className = 'zb-explanation has-explanation ' + (choice === 1 ? 'correct' : 'incorrect');
      feedback.textContent = choice === 1 ? 'Correct' : 'Try again';
      if (choice === 1) {
        question.querySelector('.question-chevron').setAttribute('aria-label', 'Question completed');
        mark();
      }
    }, 70);
  }
});
`;
