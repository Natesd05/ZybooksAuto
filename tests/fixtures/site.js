(() => {
  const mode = document.body.dataset.case;
  window.fixtureActions = [];
  const mark = (root, message, complete = false) => {
    root.dataset.revision = String(Number(root.dataset.revision ?? 0) + 1);
    if (complete) root.dataset.complete = 'true';
    const output = root.querySelector('output');
    if (output) {
      output.dataset.feedback = message;
      output.textContent = message;
    }
  };
  const later = (root, fn) => {
    if (mode === 'offline') return;
    setTimeout(
      () => {
        if (mode === 'rerender') {
          const next = root.cloneNode(true);
          root.replaceWith(next);
          root = next;
        }
        fn(root);
      },
      mode === 'slow' ? 1800 : 70,
    );
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-control]');
    const root = button?.closest('[data-zf-activity]');
    if (!button || !root) return;
    const control = button.dataset.control;
    window.fixtureActions.push(control);
    if (control === 'speed') {
      button.setAttribute('aria-pressed', 'true');
      mark(root, 'Speed selected');
    } else if (control === 'start')
      later(root, (el) => {
        el.dataset.player = 'next';
        el.querySelector('[data-control="next"]').disabled = false;
        mark(el, 'Step ready');
      });
    else if (control === 'next') later(root, (el) => mark(el, 'Complete', true));
    else if (button.hasAttribute('data-choice')) {
      button.dataset.tried = 'true';
      later(root, (el) => {
        const correct = control === 'q1:b';
        if (correct) el.querySelector('[data-question]').dataset.complete = 'true';
        mark(el, correct ? 'Correct' : 'Incorrect', correct);
      });
    } else if (control?.startsWith('reveal:')) {
      button.setAttribute('aria-expanded', 'true');
      root.querySelector('[data-answers]').hidden = false;
      mark(root, 'Answer revealed');
    } else if (control?.startsWith('submit:')) {
      root.querySelector('[data-question]').dataset.submitted = 'true';
      later(root, (el) => {
        const correct =
          el.querySelector('[data-field="number"]')?.value === '7' &&
          el.querySelector('[data-field="code"]')?.value === '  x < 7;\n    next();';
        if (correct) el.querySelector('[data-question]').dataset.complete = 'true';
        mark(el, correct ? 'Correct' : 'Incorrect', correct);
      });
    } else if (control?.startsWith('place:')) {
      const [, id, position] = control.split(':');
      root.querySelector(`[data-block="${id}"]`).dataset.position = position;
      mark(root, 'Block placed');
    } else if (control?.startsWith('indent:') || control?.startsWith('outdent:')) {
      const [action, id] = control.split(':');
      const block = root.querySelector(`[data-block="${id}"]`);
      block.dataset.indent = String(Number(block.dataset.indent) + (action === 'indent' ? 1 : -1));
      mark(root, 'Indentation accepted');
    } else if (control === 'check-order') {
      root.dataset.submitted = 'true';
      const correct =
        root.querySelector('[data-block="first"]').dataset.position === '0' &&
        root.querySelector('[data-block="second"]').dataset.position === '1' &&
        root.querySelector('[data-block="second"]').dataset.indent === '1';
      later(root, (el) => mark(el, correct ? 'Correct' : 'Incorrect', correct));
    }
  });
  document.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-target]')) event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    const target = event.target.closest('[data-target]');
    if (!target) return;
    event.preventDefault();
    const root = target.closest('[data-zf-activity]');
    const id = event.dataTransfer.getData('text/plain');
    window.fixtureActions.push(`drop:${id}:${target.dataset.target}:${event.isTrusted}`);
    const source = root.querySelector(`[data-source="${id}"]`);
    if (
      (id === 'a' && target.dataset.target === 'one') ||
      (id === 'b' && target.dataset.target === 'two')
    ) {
      source.dataset.accepted = 'true';
      target.append(source);
      mark(
        root,
        'Placement accepted',
        root.querySelectorAll('[data-source][data-accepted="true"]').length === 2,
      );
    }
  });
  if (mode === 'spa')
    document.addEventListener('click', async (event) => {
      const link = event.target.closest('a[data-zf-next]');
      if (!link) return;
      event.preventDefault();
      const href = link.href;
      const html = await (await fetch(href)).text();
      history.pushState({}, '', href);
      document.querySelector('main').dataset.ready = 'false';
      setTimeout(() => {
        const next = new DOMParser().parseFromString(html, 'text/html').querySelector('main');
        document.querySelector('main').replaceWith(next);
      }, 300);
    });
})();
