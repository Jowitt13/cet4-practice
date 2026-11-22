(() => {
  'use strict';

  const labels = {L:'听力', R:'阅读', W:'写作', T:'翻译'};
  const storage = 'cet6.practice.v1';
  const main = document.querySelector('main');
  const status = document.querySelector('#save-status');
  const assets = new Map();
  let catalog;
  let record;
  let part;
  let state;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(text, action, className) {
    const node = element('button', text, className);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function asset(path) {
    const data = document.getElementById(path);
    if (!data) return path;
    if (!assets.has(path)) {
      const content = data.textContent.trim();
      const chunks = [];
      for (let start=0; start<content.length; start+=1048576) {
        const raw = atob(content.slice(start,start+1048576));
        chunks.push(Uint8Array.from(raw, char => char.charCodeAt(0)));
      }
      assets.set(path, URL.createObjectURL(new Blob(chunks,{type:data.dataset.mime})));
    }
    return assets.get(path);
  }

  function clearUrls() {
    for (const url of assets.values()) URL.revokeObjectURL(url);
    assets.clear();
  }

  function fresh() { return {answers:{}, text:'', submitted:false, rating:null}; }

  function key() { return `${storage}.${record.id}.${part.id}`; }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(key()));
      if (!saved || typeof saved.text !== 'string' || typeof saved.submitted !== 'boolean') return fresh();
      const answers = {};
      for (const q of part.questions || []) {
        const answer = saved.answers?.[q.n];
        if (typeof answer === 'string' && answer.length === 1 && q.options.includes(answer)) answers[q.n] = answer;
      }
      const rating = Number.isInteger(saved.rating) && saved.rating>=1 && saved.rating<=15 ? saved.rating : null;
      return {answers, text:saved.text, submitted:saved.submitted, rating};
    } catch { return fresh(); }
  }

  function save() {
    try {
      localStorage.setItem(key(),JSON.stringify(state));
      status.textContent = '已保存到当前浏览器';
    } catch { status.textContent = '当前浏览器无法保存，刷新后本次作答可能丢失'; }
  }

  function route() {
    const [id, code] = location.hash.replace(/^#/, '').split('/');
    record = catalog.find(row=>row.id===id);
    part = record?.parts.find(row=>row.id===code);
    state = part ? restore() : null;
    clearUrls();
    status.textContent = '';
    if (part) renderPart();
    else renderCatalog();
    window.scrollTo(0,0);
    main.querySelector('h1')?.focus({preventScroll:true});
  }

  function heading(text) {
    const node = element('h1',text);
    node.tabIndex = -1;
    return node;
  }

  function renderCatalog() {
    main.replaceChildren(heading('六级专项练习'));
    main.append(element('p','按原卷实际提供的部分练习。每个专项单独作答、计分和复盘。','intro'));
    const list = element('div');
    const filter = element('select');
    filter.setAttribute('aria-label','选择年份');
    const years = [...new Set(catalog.map(row=>row.id.slice(0,4)))].sort().reverse();
    for (const year of ['', ...years]) {
      const choice = element('option',year || '全部年份');
      choice.value = year;
      filter.append(choice);
    }
    const renderRows = () => {
      list.replaceChildren();
      for (const year of years.filter(y=>!filter.value || y===filter.value)) {
        list.append(element('h2',year,'year'));
        for (const row of catalog.filter(r=>r.id.startsWith(year)).sort((a,b)=>b.id.localeCompare(a.id))) {
          const item = element('article',undefined,'edition');
          item.append(element('h3',row.title));
          const menu = element('nav',undefined,'part-links');
          menu.setAttribute('aria-label',row.title+'的专项');
          for (const p of row.parts) {
            const link = element('a',labels[p.id]);
            link.href = `#${row.id}/${p.id}`;
            menu.append(link);
          }
          item.append(menu);
          if (row.tags.length) item.append(element('p',row.tags.join(' · '),'quiet'));
          list.append(item);
        }
      }
    };
    filter.addEventListener('change',renderRows);
    main.append(filter,list);
    renderRows();
  }

  function pictures(attachments, caption, deferInline=false) {
    const box = element('div',undefined,'pages');
    const activate = [];
    for (const image of attachments) {
      const figure = element('figure');
      const img = element('img');
      img.width = image.width;
      img.height = image.height;
      img.alt = caption+'第'+image.page+'页';
      img.loading = 'lazy';
      if (deferInline) activate.push(()=>{img.src=asset(image.src);});
      else img.src = asset(image.src);
      img.addEventListener('error',()=>figure.append(element('p','页面图未加载，刷新后可重试。','quiet')),{once:true});
      figure.append(img,element('figcaption',img.alt));
      box.append(figure);
    }
    return {box, activate:()=>activate.splice(0).forEach(fn=>fn())};
  }

  function renderPart() {
    main.replaceChildren();
    const back = element('a','返回专项列表','back');
    back.href = '#';
    main.append(back,heading(record.title),element('p',labels[part.id]+'专项','intro'));
    if (record.tags.length) main.append(element('p',record.tags.join(' · '),'quiet'));
    if (part.audio) {
      const audio = element('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = asset(part.audio);
      main.append(audio);
    }
    const work = element('div',undefined,'work');
    const pane = pictures(part.pages,'题卷物理').box;
    const form = element('section',undefined,'responses');
    form.setAttribute('aria-label','本次作答');
    form.append(element('h2',state.submitted?'本次复盘':'本次作答'));
    work.append(pane,form);
    main.append(work);
    if (part.questions) renderQuestions(form);
    else renderWriting(form);
    if (state.submitted) {
      const review = element('details',undefined,'review');
      review.append(element('summary','展开原书参考与解析'));
      const refs=pictures(part.review,'解析物理',true);
      review.append(refs.box);
      review.addEventListener('toggle',()=>{if(review.open)refs.activate();});
      main.append(review);
    }
    form.append(state.submitted ? button('重新练习',()=>{
      if (!confirm('清空本专项的本次作答，重新练习？')) return;
      state=fresh(); save(); renderPart(); window.scrollTo(0,0);
    }) : button('提交并复盘',()=>{
      if (!confirm('提交本专项作答并查看参考答案？')) return;
      state.submitted=true; save(); renderPart(); window.scrollTo(0,0);
    },'primary'));
  }

  function format(n) { return Number(n.toFixed(2)).toString(); }

  function renderQuestions(form) {
    const gradable = part.questions.filter(q=>q.answer);
    const max = gradable.reduce((sum,q)=>sum+q.weight,0);
    const points = gradable.reduce((sum,q)=>sum+(state.answers[q.n]===q.answer?q.weight:0),0);
    if (state.submitted && max) form.append(element('p',`${format(points)} / ${format(max)} 分`,'score'));
    if (!state.submitted && max) form.append(element('p',`本专项计分上限 ${format(max)} 分。`,'quiet'));
    if (gradable.length !== part.questions.length) {
      form.append(element('p',`有 ${part.questions.length-gradable.length} 题的答案待确认，可作答并对照原书，自行核对。`,'quiet'));
    }
    const grid = element('div',undefined,'answers');
    for (const q of part.questions) {
      const line = element('label',undefined,'answer');
      line.append(element('span',String(q.n)));
      const select = element('select');
      select.setAttribute('aria-label',`第${q.n}题答案`);
      select.name = String(q.n);
      const empty = element('option','—');
      empty.value='';
      select.append(empty);
      for (const letter of q.options) select.append(element('option',letter));
      select.value = state.answers[q.n] || '';
      select.disabled = state.submitted;
      select.addEventListener('change',()=>{state.answers[q.n]=select.value;save();});
      line.append(select);
      if (state.submitted) line.append(element('small',q.answer?`参考 ${q.answer}`:'自查',q.answer===state.answers[q.n]?'correct':'quiet'));
      grid.append(line);
    }
    form.append(grid);
  }

  function renderWriting(form) {
    const input = element('textarea');
    input.setAttribute('aria-label',labels[part.id]+'作答');
    input.placeholder = '在此输入作答';
    input.value = state.text;
    input.readOnly = state.submitted;
    input.addEventListener('input',()=>{state.text=input.value;save();});
    form.append(input);
    if (!state.submitted) return;
    const label = element('label','对照原书自评（1–15）','rating');
    const rating = element('select');
    const empty=element('option','待自评');empty.value='';rating.append(empty);
    for (let n=1;n<=15;n++) rating.append(element('option',String(n)));
    rating.value = state.rating ?? '';
    const score = element('p',state.rating?format(state.rating*7.1)+' / 106.5 分':'','score');
    rating.addEventListener('change',()=>{
      state.rating=rating.value?Number(rating.value):null;
      score.textContent=state.rating?format(state.rating*7.1)+' / 106.5 分':'';
      save();
    });
    label.append(rating);
    form.append(label,score);
  }

  async function boot() {
    try {
      const inline = document.querySelector('#practice-data');
      if (inline) catalog=JSON.parse(inline.textContent);
      else {
        const response=await fetch('./catalog.json');
        if (!response.ok) throw Error('题库暂未加载');
        catalog=await response.json();
      }
      if (!Array.isArray(catalog) || !catalog.length) throw Error('专项目录为空');
      window.addEventListener('hashchange',route);
      route();
    } catch {
      main.replaceChildren(heading('专项题库暂未加载'),button('重试',()=>location.reload(),'primary'));
    }
  }

  try {
    if (JSON.parse(localStorage.getItem('cet6.paper.v1.preferences'))?.theme==='dark') document.documentElement.dataset.theme='dark';
  } catch {}
  document.querySelector('#theme').addEventListener('click',()=>{
    const root=document.documentElement;
    root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
  });
  boot();
})();
