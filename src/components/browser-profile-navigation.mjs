export const browserToolbarHeight = 82;
export function browserProfileWidth(width) {
  if (width >= 960) return 248;
  return width >= 630 ? 190 : 156;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, accessibleName) {
  const node = element('button', className, text);
  node.type = 'button';
  if (accessibleName) node.setAttribute('aria-label', accessibleName);
  return node;
}

export function mountProfileNavigation(root, { onAction }) {
  root.classList.add('profile-navigation');
  const rail = element('aside', 'profile-rail');
  const profiles = element('nav', 'profile-list');
  profiles.setAttribute('aria-label', 'Browser profiles');
  rail.append(element('h1', 'profile-heading', 'Profiles'), profiles);
  const header = element('header', 'profile-toolbar');
  const strip = element('nav', 'profile-tab-strip');
  const tabs = element('div', 'profile-tabs');
  const add = button('profile-new-tab', '+', 'New tab in this profile');
  add.dataset.control = 'new';
  strip.append(tabs, add);
  const form = element('form', 'profile-address');
  const address = element('input', 'profile-url');
  address.type = 'text';
  address.inputMode = 'url';
  address.spellcheck = false;
  address.autocomplete = 'off';
  address.setAttribute('aria-label', 'Open address');
  address.placeholder = 'Open address';
  const go = element('button', 'profile-go', 'Go');
  go.type = 'submit';
  form.append(address, go);
  header.append(strip, form);
  const page = element('main', 'profile-page');
  const empty = element('p', 'profile-empty', 'Enter a website address to open a tab in this profile.');
  const notice = element('p', 'profile-error');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  page.append(empty);
  root.replaceChildren(rail, header, page, notice);
  let state;
  let pendingRevision = -1;
  const error = message => {
    notice.textContent = message;
    notice.hidden = !message;
  };
  function send(type, value) {
    if (!state) return;
    error('');
    const { profile, tab } = state;
    Promise.resolve(onAction({ type, value, profile, tab })).then(reply => {
      if (reply?.error && state?.profile === profile && state?.tab === tab) error(reply.error);
    }, () => error('The Browser could not complete the action.'));
  }
  add.addEventListener('click', () => send('new-tab'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = address.value.trim();
    if (value) send('navigate', value);
  });

  function update(next) {
    if (next.revision <= pendingRevision) return;
    pendingRevision = next.revision;
    const focus = root.contains(document.activeElement) && document.activeElement.dataset?.control;
    if (state && (state.profile !== next.profile || state.tab !== next.tab)) error('');
    state = next;
    const active = next.profiles.find(profile => profile.id === next.profile);
    profiles.replaceChildren(...next.profiles.map(profile => {
      const name = button('profile-choice', undefined);
      const header = element('span', 'profile-label-line');
      const label = element('span', 'profile-name', profile.name);
      const badge = element('span', 'profile-count', String(profile.tabs.length));
      badge.setAttribute('aria-hidden', 'true');
      header.append(label, badge);
      name.append(header);
      const sites = [...new Set(profile.tabs.map(tab => tab.site).filter(Boolean))].join(' · ');
      if (sites) name.append(element('span', 'profile-sites', sites));
      name.title = sites ? profile.name + ' · ' + sites : profile.name;
      name.setAttribute('aria-label', profile.name + ', ' + profile.tabs.length + (profile.tabs.length === 1 ? ' open tab' : ' open tabs'));
      name.dataset.control = 'profile:' + profile.id;
      if (profile === active) name.setAttribute('aria-current', 'true');
      name.addEventListener('click', () => send('select-profile', profile.id));
      return name;
    }));
    strip.setAttribute('aria-label', active ? 'Open tabs in ' + active.name : 'Open tabs');
    tabs.replaceChildren(...(active?.tabs ?? []).map(tab => {
      const item = element('div', 'profile-tab');
      const label = tab.site || 'New tab';
      const select = button('profile-select-tab', label);
      select.title = label;
      select.dataset.control = 'tab:' + tab.id;
      if (tab.id === next.tab) select.setAttribute('aria-current', 'page');
      select.addEventListener('click', () => send('select-tab', tab.id));
      const close = button('profile-close-tab', '×', 'Close ' + label + ' tab');
      close.dataset.control = 'close:' + tab.id;
      close.addEventListener('click', () => send('close-tab', tab.id));
      item.append(select, close);
      return item;
    }));
    empty.hidden = next.tab !== null;
    if (focus) {
      const target = Array.from(root.querySelectorAll('[data-control]')).find(node => node.dataset.control === focus);
      (target ?? add).focus({ preventScroll: true });
    }
  }
  return { update, error, page };
}
